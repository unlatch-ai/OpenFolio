import type {
  AskResponse,
  AskRunInput,
  ConnectorSyncResult,
  EditablePersonProfile,
  MessagesAccessStatus,
  MessagesImportJob,
  ReminderSuggestion,
  RelationshipDigest,
  SearchResult,
} from "@openfolio/shared-types";
import { OpenFolioDatabase } from "./db.js";
import { AIOrchestrator } from "./ai.js";
import { MessagesImporter, getMessagesAccessStatus, DEFAULT_MESSAGES_DB_PATH } from "./messages.js";
import { LocalEmbeddingEngine } from "./local-embeddings.js";
import { AnalyticsEngine } from "./analytics.js";
import { ChatDbWatcher, type SyncWatcherState } from "./watcher.js";
import type { StoredProviderConfig } from "./types.js";

export class OpenFolioCore {
  readonly db: OpenFolioDatabase;

  ai: AIOrchestrator;

  readonly messages: MessagesImporter;

  readonly localEmbeddings: LocalEmbeddingEngine;

  readonly analytics: AnalyticsEngine;

  private watcher: ChatDbWatcher | null = null;

  private embeddingSyncInFlight: Promise<{ embedded: number; skipped: number }> | null = null;

  private embeddingSyncLastError: string | null = null;

  constructor(options?: {
    dbPath?: string;
    aiConfig?: StoredProviderConfig | null;
    enableLocalEmbeddings?: boolean;
    networkPolicy?: "offline";
  }) {
    this.db = new OpenFolioDatabase(options?.dbPath);

    // Local embeddings enabled when explicitly requested, or in the Electron app (no API key).
    // Disabled when aiConfig is explicitly null (test/CI environments).
    const shouldUseLocal = options?.enableLocalEmbeddings === true;
    this.localEmbeddings = shouldUseLocal ? new LocalEmbeddingEngine() : new LocalEmbeddingEngine({ modelId: "__disabled__" });

    // Network Lock is the only supported core runtime policy. Provider and
    // proxy environment variables are intentionally ignored.
    void options?.aiConfig;
    void options?.networkPolicy;
    this.ai = new AIOrchestrator(
      shouldUseLocal ? { provider: "local" as const } : null,
      shouldUseLocal ? this.localEmbeddings : null,
    );
    this.messages = new MessagesImporter(this.db);
    this.analytics = new AnalyticsEngine(this.db);
  }

  configureAi(_aiConfig: StoredProviderConfig | null) {
    this.ai = new AIOrchestrator({ provider: "local" }, this.localEmbeddings);
  }

  getMessagesAccessStatus(): MessagesAccessStatus {
    return getMessagesAccessStatus();
  }

  async startMessagesImport(): Promise<MessagesImportJob> {
    const job = await this.messages.importFromChatDb();
    if (job.status === "completed") {
      void this.queueEmbeddingSync().catch((error) => {
        console.error("[openfolio-core] Background embedding sync failed:", error);
      });
    }
    return job;
  }

  getMessagesImportStatus(jobId: string) {
    return this.messages.getJob(jobId);
  }

  getActiveMessagesImport() {
    return this.messages.getActiveJob();
  }

  cancelMessagesImport(jobId: string) {
    return this.messages.cancelJob(jobId);
  }

  async retryMessagesImport(_jobId?: string | null): Promise<MessagesImportJob> {
    return this.startMessagesImport();
  }

  async search(text: string, limit = 10, scope?: Pick<AskRunInput, "personId" | "threadId" | "sourceScope">): Promise<SearchResult[]> {
    const embedding = await this.ai.embed(text);
    return this.db.search(text, limit, embedding ?? undefined, scope);
  }

  getSearchScaleStatus(options?: { vectorScanWarningThreshold?: number }) {
    return this.db.getSearchScaleStatus(options);
  }

  async ask(input: string | AskRunInput): Promise<AskResponse> {
    const request = typeof input === "string" ? { query: input, sourceScope: "all" as const } : input;
    const sourceScope = request.sourceScope ?? "all";
    const results = await this.search(request.query, 8, {
      sourceScope,
      personId: request.personId,
      threadId: request.threadId,
    });
    return this.ai.answer(request.query, results, sourceScope);
  }

  getPerson(personId: string) {
    return this.db.getPerson(personId);
  }

  addNote(entityType: "person" | "thread" | "group", entityId: string, content: string) {
    const note = this.db.createNote(entityType, entityId, content);
    this.db.refreshSearchDocuments({ notes: [note.id] });
    void this.queueEmbeddingSync().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return note;
  }

  pinNote(noteId: string) {
    const note = this.db.setNotePinned(noteId, true);
    if (note) {
      this.db.refreshSearchDocuments({ notes: [note.id], people: note.entityType === "person" ? [note.entityId] : [] });
    }
    return note;
  }

  unpinNote(noteId: string) {
    const note = this.db.setNotePinned(noteId, false);
    if (note) {
      this.db.refreshSearchDocuments({ notes: [note.id], people: note.entityType === "person" ? [note.entityId] : [] });
    }
    return note;
  }

  addReminder(title: string, personId: string | null, dueAt: number | null) {
    const reminder = this.db.createReminder(title, personId, dueAt);
    this.db.refreshSearchDocuments({
      reminders: [reminder.id],
      people: personId ? [personId] : [],
    });
    void this.queueEmbeddingSync().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return reminder;
  }

  updateReminderStatus(reminderId: string, status: "open" | "done") {
    const reminder = this.db.updateReminderStatus(reminderId, status);
    if (reminder) {
      this.db.refreshSearchDocuments({
        reminders: [reminder.id],
        people: reminder.personId ? [reminder.personId] : [],
      });
    }
    return reminder;
  }

  applyConnectorSync(result: ConnectorSyncResult) {
    const summary = this.db.applyConnectorSync(result);
    void this.queueEmbeddingSync().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return summary;
  }

  async syncDirtySearchDocuments(limit = 50) {
    const dirtyDocuments = this.db.getDirtySearchDocuments(limit);
    if (dirtyDocuments.length === 0) {
      return { embedded: 0, skipped: 0 };
    }

    const embeddings = await this.ai.embedDocuments(dirtyDocuments);
    const metadata = this.ai.getEmbeddingMetadata();

    if (embeddings.length === 0 || !metadata.provider) {
      return { embedded: 0, skipped: dirtyDocuments.length };
    }
    const provider = metadata.provider;

    let embedded = 0;
    embeddings.forEach((embedding, index) => {
      const document = dirtyDocuments[index];
      if (!document || !embedding) {
        return;
      }
      this.db.markSearchDocumentEmbedded(document.id, embedding, provider, metadata.model);
      embedded += 1;
    });

    return { embedded, skipped: dirtyDocuments.length - embedded };
  }

  async syncAllDirtySearchDocuments(batchSize = 50, maxBatches = 200) {
    let embedded = 0;
    let skipped = 0;

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await this.syncDirtySearchDocuments(batchSize);
      embedded += result.embedded;
      skipped += result.skipped;
      if (result.embedded === 0 || this.db.getDirtySearchDocuments(1).length === 0) {
        break;
      }
    }

    return { embedded, skipped };
  }

  queueEmbeddingSync(options?: { batchSize?: number; maxBatches?: number }) {
    if (this.embeddingSyncInFlight) {
      return this.embeddingSyncInFlight;
    }

    this.embeddingSyncLastError = null;
    this.embeddingSyncInFlight = this.syncAllDirtySearchDocuments(options?.batchSize, options?.maxBatches)
      .catch((error) => {
        this.embeddingSyncLastError = error instanceof Error ? error.message : "Embedding sync failed.";
        throw error;
      })
      .finally(() => {
        this.embeddingSyncInFlight = null;
      });

    return this.embeddingSyncInFlight;
  }

  getEmbeddingSyncStatus() {
    return {
      ...this.db.getEmbeddingSyncStatus(),
      syncing: this.embeddingSyncInFlight !== null,
      lastError: this.embeddingSyncLastError,
    };
  }

  getRelationshipDigest(personId: string): RelationshipDigest | null {
    return this.db.relationshipDigest(personId);
  }

  getPersonProfile(personId: string) {
    return this.db.getPersonProfile(personId, this.analytics.getRelationshipStats(personId));
  }

  updatePersonProfile(personId: string, profile: EditablePersonProfile) {
    const person = this.db.updatePersonProfile(personId, profile);
    if (!person) return null;
    this.db.refreshSearchDocuments({ people: [personId] });
    void this.queueEmbeddingSync().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return this.getPersonProfile(personId);
  }

  addPersonAlias(personId: string, value: string, kind?: "handle" | "name" | "other") {
    const alias = this.db.addPersonAlias(personId, value, kind ?? "other");
    this.db.refreshSearchDocuments({ people: [personId] });
    void this.queueEmbeddingSync().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return alias;
  }

  deletePersonAlias(aliasId: string) {
    const personId = this.db.deletePersonAlias(aliasId);
    if (personId) {
      this.db.refreshSearchDocuments({ people: [personId] });
      void this.queueEmbeddingSync().catch((error) => {
        console.error("[openfolio-core] Background embedding sync failed:", error);
      });
    }
    return { ok: Boolean(personId) };
  }

  searchPersonMessages(personId: string, query?: string, limit = 25, offset = 0) {
    return this.db.searchPersonMessages(personId, query ?? "", limit, offset);
  }

  listPeople(limit = 100, query?: string) {
    return this.db.listPeopleForPicker(limit, query);
  }

  getReminderSuggestions(limit = 10): ReminderSuggestion[] {
    return this.db.generateReminderSuggestions(limit);
  }

  getThreadSummaries(limit = 20) {
    return this.db.getThreadSummaries(limit);
  }

  // ─── Watcher ─────────────────────────────────────────

  startWatcher(chatDbPath?: string): SyncWatcherState {
    if (this.watcher) return this.watcher.getState();

    const dbPath = chatDbPath ?? process.env.OPENFOLIO_MESSAGES_DB_PATH ?? DEFAULT_MESSAGES_DB_PATH;
    this.watcher = new ChatDbWatcher(dbPath, () => this.startMessagesImport());
    return this.watcher.start();
  }

  stopWatcher(): SyncWatcherState {
    if (!this.watcher) {
      return { watching: false, chatDbPath: null, lastSyncAt: null, pendingSync: false };
    }
    return this.watcher.stop();
  }

  getWatcherState(): SyncWatcherState {
    if (!this.watcher) {
      return { watching: false, chatDbPath: null, lastSyncAt: null, pendingSync: false };
    }
    return this.watcher.getState();
  }

  onWatcherSync(listener: (job: MessagesImportJob) => void): () => void {
    if (!this.watcher) return () => {};
    this.watcher.on("sync", listener);
    return () => { this.watcher?.off("sync", listener); };
  }

  // ─── Thread detail queries ───────────────────────────

  getThreadDetail(threadId: string) {
    return this.db.getThreadDetail(threadId);
  }

  getThreadMessages(threadId: string, limit = 50, offset = 0, aroundMessageId?: string | null, direction?: "older" | "newer") {
    const resolvedOffset = direction === "older"
      ? offset + limit
      : direction === "newer"
        ? Math.max(0, offset - limit)
        : offset;
    return this.db.getThreadMessages(threadId, limit, resolvedOffset, aroundMessageId);
  }

  listThreadsPaginated(limit = 50, offset = 0) {
    return this.db.listThreadsPaginated(limit, offset);
  }

  // ─── Local embedding status ──────────────────────────

  async getLocalEmbeddingStatus() {
    return this.localEmbeddings.getStatus();
  }
}
