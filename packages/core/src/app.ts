import type {
  AskResponse,
  ConnectorSyncResult,
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

  readonly ai: AIOrchestrator;

  readonly messages: MessagesImporter;

  readonly localEmbeddings: LocalEmbeddingEngine;

  readonly analytics: AnalyticsEngine;

  private watcher: ChatDbWatcher | null = null;

  constructor(options?: { dbPath?: string; aiConfig?: StoredProviderConfig | null; enableLocalEmbeddings?: boolean }) {
    this.db = new OpenFolioDatabase(options?.dbPath);

    // Local embeddings enabled when explicitly requested, or in the Electron app (no API key).
    // Disabled when aiConfig is explicitly null (test/CI environments).
    const shouldUseLocal = options?.enableLocalEmbeddings === true;
    this.localEmbeddings = shouldUseLocal ? new LocalEmbeddingEngine() : new LocalEmbeddingEngine({ modelId: "__disabled__" });

    const aiConfig = options?.aiConfig ?? (process.env.OPENAI_API_KEY
      ? {
          provider: "openai" as const,
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
          embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
        }
      : shouldUseLocal ? { provider: "local" as const } : null);

    this.ai = new AIOrchestrator(aiConfig, shouldUseLocal ? this.localEmbeddings : null);
    this.messages = new MessagesImporter(this.db);
    this.analytics = new AnalyticsEngine(this.db);
  }

  getMessagesAccessStatus(): MessagesAccessStatus {
    return getMessagesAccessStatus();
  }

  async startMessagesImport(): Promise<MessagesImportJob> {
    const job = await this.messages.importFromChatDb();
    if (job.status === "completed") {
      await this.syncDirtySearchDocuments();
    }
    return job;
  }

  getMessagesImportStatus(jobId: string) {
    return this.messages.getJob(jobId);
  }

  async search(text: string, limit = 10): Promise<SearchResult[]> {
    const embedding = await this.ai.embed(text);
    return this.db.search(text, limit, embedding ?? undefined);
  }

  async ask(query: string): Promise<AskResponse> {
    const results = await this.search(query, 8);
    return this.ai.answer(query, results);
  }

  getPerson(personId: string) {
    return this.db.getPerson(personId);
  }

  addNote(entityType: "person" | "thread" | "group", entityId: string, content: string) {
    const note = this.db.createNote(entityType, entityId, content);
    this.db.refreshSearchDocuments({ notes: [note.id] });
    void this.syncDirtySearchDocuments().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return note;
  }

  addReminder(title: string, personId: string | null, dueAt: number | null) {
    const reminder = this.db.createReminder(title, personId, dueAt);
    this.db.refreshSearchDocuments({
      reminders: [reminder.id],
      people: personId ? [personId] : [],
    });
    void this.syncDirtySearchDocuments().catch((error) => {
      console.error("[openfolio-core] Background embedding sync failed:", error);
    });
    return reminder;
  }

  applyConnectorSync(result: ConnectorSyncResult) {
    const summary = this.db.applyConnectorSync(result);
    void this.syncDirtySearchDocuments().catch((error) => {
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

    embeddings.forEach((embedding, index) => {
      const document = dirtyDocuments[index];
      if (!document || !embedding) {
        return;
      }
      this.db.markSearchDocumentEmbedded(document.id, embedding, provider, metadata.model);
    });

    return { embedded: embeddings.length, skipped: dirtyDocuments.length - embeddings.length };
  }

  getRelationshipDigest(personId: string): RelationshipDigest | null {
    return this.db.relationshipDigest(personId);
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

  getThreadMessages(threadId: string, limit = 50, offset = 0) {
    return this.db.getThreadMessages(threadId, limit, offset);
  }

  listThreadsPaginated(limit = 50, offset = 0) {
    return this.db.listThreadsPaginated(limit, offset);
  }

  // ─── Local embedding status ──────────────────────────

  async getLocalEmbeddingStatus() {
    return this.localEmbeddings.getStatus();
  }
}
