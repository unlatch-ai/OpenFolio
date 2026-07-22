import type {
  ConnectorSyncResult,
  EditablePersonProfile,
  EmbeddingPriority,
  MessagesAccessStatus,
  MessagesImportJob,
  ReminderSuggestion,
  RelationshipDigest,
  SearchQueryInput,
  SearchResponse,
  SearchResult,
} from "@openfolio/shared-types";
import { OpenFolioDatabase } from "./db.js";
import { AIOrchestrator } from "./ai.js";
import { MessagesImporter, getMessagesAccessStatus, DEFAULT_MESSAGES_DB_PATH } from "./messages.js";
import { LocalEmbeddingEngine, type EmbeddingEngine } from "./local-embeddings.js";
import { AnalyticsEngine } from "./analytics.js";
import { ChatDbWatcher, type SyncWatcherState } from "./watcher.js";

type SearchScope = {
  sourceScope?: "all" | "person" | "thread";
  personId?: string | null;
  threadId?: string | null;
};

export class OpenFolioCore {
  readonly db: OpenFolioDatabase;

  ai: AIOrchestrator;

  readonly messages: MessagesImporter;

  readonly localEmbeddings: EmbeddingEngine;

  readonly analytics: AnalyticsEngine;

  private watcher: ChatDbWatcher | null = null;

  private embeddingSyncInFlight: Promise<{ embedded: number; skipped: number }> | null = null;

  private embeddingSyncLastError: string | null = null;

  private vectorIndexSyncInFlight: Promise<number> | null = null;

  private vectorIndexSyncLastError: string | null = null;

  private embeddingDocumentsPerSecond: number | null = null;

  private readonly vectorIndexSyncRunner: ((dbPath: string) => Promise<number>) | null;

  constructor(options?: {
    dbPath?: string;
    enableLocalEmbeddings?: boolean;
    embeddingEngine?: EmbeddingEngine;
    networkPolicy?: "offline";
    vectorIndexSync?: (dbPath: string) => Promise<number>;
  }) {
    this.db = new OpenFolioDatabase(options?.dbPath);
    this.vectorIndexSyncRunner = options?.vectorIndexSync ?? null;
    const storedEmbeddingRate = Number(this.db.getSetting("embedding_documents_per_second"));
    this.embeddingDocumentsPerSecond = Number.isFinite(storedEmbeddingRate) && storedEmbeddingRate > 0
      ? storedEmbeddingRate
      : null;

    // Local embeddings enabled when explicitly requested, or in the Electron app (no API key).
    const shouldUseLocal = options?.enableLocalEmbeddings === true || options?.embeddingEngine != null;
    this.localEmbeddings = options?.embeddingEngine
      ?? (shouldUseLocal ? new LocalEmbeddingEngine() : new LocalEmbeddingEngine({ modelId: "__disabled__" }));

    // Network Lock is the only supported core runtime policy.
    void options?.networkPolicy;
    this.ai = new AIOrchestrator(shouldUseLocal ? this.localEmbeddings : null);
    this.messages = new MessagesImporter(this.db);
    this.analytics = new AnalyticsEngine(this.db);
    void this.queueSearchVectorIndexSync().catch((error) => {
      console.error("[openfolio-core] Local vector index sync failed:", error);
    });
  }

  getMessagesAccessStatus(): MessagesAccessStatus {
    return getMessagesAccessStatus();
  }

  async startMessagesImport(): Promise<MessagesImportJob> {
    const job = await this.messages.importFromChatDb();
    if (job.status === "completed" && job.importedMessages > 0) {
      this.db.invalidateEmbeddingPriority();
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

  async search(text: string, limit = 10, scope?: SearchScope): Promise<SearchResult[]> {
    const embedding = await this.ai.embed(text);
    return this.db.search(text, limit, embedding ?? undefined, scope);
  }

  async searchArchive(input: SearchQueryInput): Promise<SearchResponse> {
    if (
      input.dateRange?.startAt != null
      && input.dateRange?.endAt != null
      && input.dateRange.startAt >= input.dateRange.endAt
    ) {
      return {
        state: "error",
        results: [],
        resultCount: 0,
        retrievalMode: "exact",
        semanticStatus: "unavailable",
        semanticMessage: null,
        error: {
          code: "invalid_filters",
          message: "Search could not use that date range.",
          details: "endAt must be later than startAt.",
        },
      };
    }

    const text = input.text.trim();
    if (!text) {
      return {
        state: "empty",
        results: [],
        resultCount: 0,
        retrievalMode: "exact",
        semanticStatus: "unavailable",
        semanticMessage: null,
        error: null,
      };
    }

    const embedding = await this.ai.embed(text);
    let results: SearchResult[];
    try {
      results = this.db.searchRecords({ ...input, text }, embedding ?? undefined);
    } catch (error) {
      return {
        state: "error",
        results: [],
        resultCount: 0,
        retrievalMode: "exact",
        semanticStatus: "unavailable",
        semanticMessage: null,
        error: {
          code: "local_index_unavailable",
          message: "Search could not read the local index. Try again.",
          details: error instanceof Error ? error.message : "Unknown local index error.",
        },
      };
    }
    const [localStatus, syncStatus] = await Promise.all([
      this.localEmbeddings.getStatus(),
      Promise.resolve(this.getEmbeddingSyncStatus()),
    ]);

    let semanticStatus: SearchResponse["semanticStatus"];
    let semanticMessage: string | null = null;
    if (!embedding) {
      semanticStatus = "unavailable";
      semanticMessage = localStatus.error ?? "Semantic search is unavailable. Exact search is still available.";
    } else if (syncStatus.syncing || syncStatus.dirtyDocuments > 0 || syncStatus.embeddedDocuments === 0) {
      semanticStatus = "indexing";
      semanticMessage = "Search is ready. Meaning-based matches will improve as indexing finishes.";
    } else {
      semanticStatus = "ready";
    }

    return {
      state: results.length > 0 ? "results" : "empty",
      results,
      resultCount: results.length,
      retrievalMode: embedding && syncStatus.embeddedDocuments > 0 ? "hybrid" : "exact",
      semanticStatus,
      semanticMessage,
      error: null,
    };
  }

  getConversationCitationContext(threadId: string, messageId: string, before?: number, after?: number) {
    const context = this.db.getConversationCitationContext(threadId, messageId, before, after);
    if (!context) {
      throw new Error("The cited message is not available in that local conversation.");
    }
    return context;
  }

  getSearchScaleStatus(options?: { vectorScanWarningThreshold?: number }) {
    return this.db.getSearchScaleStatus(options);
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

    const startedAt = Date.now();
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

    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
    if (embedded > 0) {
      const observedRate = embedded / elapsedSeconds;
      this.embeddingDocumentsPerSecond = this.embeddingDocumentsPerSecond == null
        ? observedRate
        : (this.embeddingDocumentsPerSecond * 0.7) + (observedRate * 0.3);
      this.db.setSetting("embedding_documents_per_second", String(this.embeddingDocumentsPerSecond));
    }

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
      // Keep the Electron main process responsive between local SQLite writes
      // and the next worker request.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    return { embedded, skipped };
  }

  queueEmbeddingSync(options?: { batchSize?: number; maxBatches?: number }) {
    if (this.embeddingSyncInFlight) {
      return this.embeddingSyncInFlight;
    }

    this.db.applyEmbeddingPriority();
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

  private async syncSearchVectorIndex(batchSize = 250) {
    let indexed = 0;
    while (true) {
      const batchIndexed = this.db.backfillSearchVectorIndex(batchSize);
      indexed += batchIndexed;
      if (batchIndexed === 0) break;
      // Keep the Electron main process responsive during one-time upgrades from
      // the legacy JSON-only embedding store.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    return indexed;
  }

  private queueSearchVectorIndexSync() {
    if (this.vectorIndexSyncInFlight) return this.vectorIndexSyncInFlight;

    this.vectorIndexSyncLastError = null;
    const sync = this.vectorIndexSyncRunner
      ? this.vectorIndexSyncRunner(this.db.dbPath)
      : this.syncSearchVectorIndex();
    this.vectorIndexSyncInFlight = sync
      .catch((error) => {
        this.vectorIndexSyncLastError = error instanceof Error ? error.message : "Local vector index sync failed.";
        throw error;
      })
      .finally(() => {
        this.vectorIndexSyncInFlight = null;
      });
    return this.vectorIndexSyncInFlight;
  }

  getEmbeddingSyncStatus() {
    return {
      ...this.db.getEmbeddingSyncStatus(),
      syncing: this.embeddingSyncInFlight !== null || this.vectorIndexSyncInFlight !== null,
      lastError: this.embeddingSyncLastError ?? this.vectorIndexSyncLastError,
    };
  }

  getEmbeddingPlanStats() {
    return this.db.getEmbeddingPlanStats(this.embeddingDocumentsPerSecond);
  }

  setEmbeddingPriority(priority: EmbeddingPriority) {
    this.db.setEmbeddingPriority(priority);
    return this.getEmbeddingPlanStats();
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
