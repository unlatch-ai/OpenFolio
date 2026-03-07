import type {
  AskResponse,
  MessagesAccessStatus,
  MessagesImportJob,
  ReminderSuggestion,
  RelationshipDigest,
  SearchResult,
} from "@openfolio/shared-types";
import { OpenFolioDatabase } from "./db.js";
import { AIOrchestrator } from "./ai.js";
import { MessagesImporter, getMessagesAccessStatus } from "./messages.js";
import type { StoredProviderConfig } from "./types.js";

export class OpenFolioCore {
  readonly db: OpenFolioDatabase;

  readonly ai: AIOrchestrator;

  readonly messages: MessagesImporter;

  constructor(options?: { dbPath?: string; aiConfig?: StoredProviderConfig | null }) {
    this.db = new OpenFolioDatabase(options?.dbPath);
    this.ai = new AIOrchestrator(options?.aiConfig ?? (process.env.OPENAI_API_KEY
      ? {
          provider: "openai",
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
          embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
        }
      : null));
    this.messages = new MessagesImporter(this.db);
  }

  getMessagesAccessStatus(): MessagesAccessStatus {
    return getMessagesAccessStatus();
  }

  async startMessagesImport(): Promise<MessagesImportJob> {
    return this.messages.importFromChatDb();
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
    this.db.rebuildSearchDocuments();
    return note;
  }

  addReminder(title: string, personId: string | null, dueAt: number | null) {
    const reminder = this.db.createReminder(title, personId, dueAt);
    this.db.rebuildSearchDocuments();
    return reminder;
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
}
