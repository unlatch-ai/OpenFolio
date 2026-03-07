export type LocalEntityId = string;

export type SourceKind =
  | "messages"
  | "manual"
  | "csv"
  | "hosted_google"
  | "hosted_microsoft";

export type IngestionSource = {
  kind: SourceKind;
  accountId?: string;
  label: string;
};

export type CloudCapability =
  | "hosted_ai"
  | "managed_google_sync"
  | "managed_microsoft_sync"
  | "billing"
  | "future_sync";

export type EmbeddingProvider = "openai" | "hosted";
export type LLMProvider = "openai" | "hosted";

export interface AttachmentRef {
  id: LocalEntityId;
  messageId: LocalEntityId;
  path: string | null;
  mimeType?: string | null;
  transferName?: string | null;
}

export interface Person {
  id: LocalEntityId;
  displayName: string;
  primaryHandle: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Company {
  id: LocalEntityId;
  name: string;
  domain?: string | null;
}

export interface Interaction {
  id: LocalEntityId;
  type: "message" | "meeting" | "note" | "email" | "manual";
  entityId: LocalEntityId | null;
  title: string;
  summary: string | null;
  occurredAt: number;
}

export interface Note {
  id: LocalEntityId;
  entityType: "person" | "thread" | "group";
  entityId: LocalEntityId;
  content: string;
  createdAt: number;
}

export interface Reminder {
  id: LocalEntityId;
  title: string;
  personId: LocalEntityId | null;
  dueAt: number | null;
  status: "open" | "done";
  createdAt: number;
}

export interface Tag {
  id: LocalEntityId;
  name: string;
}

export interface Group {
  id: LocalEntityId;
  name: string;
  description: string | null;
}

export interface MessageParticipant {
  id: LocalEntityId;
  threadId: LocalEntityId;
  personId: LocalEntityId;
  handle: string;
  service: string | null;
}

export interface MessageThread {
  id: LocalEntityId;
  sourceChatId: string;
  displayName: string | null;
  participantCount: number;
  lastMessageAt: number | null;
}

export interface SourceItemRef {
  sourceKind: SourceKind;
  sourceId: string;
  entityType: "thread" | "message" | "person";
  entityId: LocalEntityId;
}

export interface SearchDocument {
  id: LocalEntityId;
  kind: "person" | "thread" | "message" | "note" | "reminder";
  entityId: LocalEntityId;
  title: string;
  content: string;
  embedding: number[] | null;
}

export interface SearchResult {
  id: string;
  kind: SearchDocument["kind"];
  entityId: string;
  title: string;
  snippet: string;
  score: number;
}

export interface MessagesImportJob {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  importedMessages: number;
  importedThreads: number;
  importedPeople: number;
  lastCursor: number | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

export interface MessagesThreadSummary {
  threadId: string;
  title: string;
  participantHandles: string[];
  lastMessagePreview: string | null;
  lastMessageAt: number | null;
}

export interface RelationshipDigest {
  personId: string;
  displayName: string;
  lastContactAt: number | null;
  messageCount: number;
  noteCount: number;
  reminderCount: number;
}

export interface ReminderSuggestion {
  personId: string;
  displayName: string;
  reason: string;
  suggestedDueAt: number | null;
}

export interface CloudAccountStatus {
  signedIn: boolean;
  accountEmail: string | null;
  capabilities: CloudCapability[];
  hostedBaseUrl: string | null;
}

export interface CloudRuntimeConfig {
  convexUrl: string | null;
  hostedBaseUrl: string | null;
  deviceName: string;
  platform: string;
}

export interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error" | "unsupported";
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  progress: number | null;
  message: string | null;
  checkedAt: number | null;
 }

export interface MessagesAccessStatus {
  status: "granted" | "denied" | "missing" | "unknown";
  chatDbPath: string | null;
  details: string;
}

export interface AskResponse {
  answer: string;
  citations: SearchResult[];
  provider: "local" | LLMProvider;
}

export interface OpenFolioBridge {
  db: {
    query(sql: string): Promise<unknown[]>;
    mutate(sql: string): Promise<{ changes: number }>;
  };
  messages: {
    requestAccess(): Promise<MessagesAccessStatus>;
    getAccessStatus(): Promise<MessagesAccessStatus>;
    startImport(): Promise<MessagesImportJob>;
    getImportStatus(jobId: string): Promise<MessagesImportJob | null>;
  };
  search: {
    query(input: { text: string; limit?: number }): Promise<SearchResult[]>;
  };
  ai: {
    run(input: { query: string; useHosted?: boolean }): Promise<AskResponse>;
  };
  cloud: {
    getConfig(): Promise<CloudRuntimeConfig>;
    beginAuthSession(): Promise<{ redirectUri: string }>;
    openExternal(url: string): Promise<void>;
    onAuthCallback(listener: (url: string) => void): () => void;
  };
  updates: {
    getState(): Promise<UpdateState>;
    checkNow(): Promise<UpdateState>;
    installNow(): Promise<void>;
    onStateChange(listener: (state: UpdateState) => void): () => void;
  };
  mcp: {
    getStatus(): Promise<{ running: boolean }>;
    start(): Promise<{ running: boolean }>;
    stop(): Promise<{ running: boolean }>;
  };
}
