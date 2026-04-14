export type LocalEntityId = string;

export type SourceKind =
  | "messages"
  | "manual"
  | "csv"
  | "apple_contacts"
  | "google_contacts"
  | "gmail"
  | "hosted_google"
  | "hosted_microsoft";

export type CloudCapability =
  | "hosted_ai"
  | "managed_google_sync"
  | "managed_gmail_sync"
  | "managed_microsoft_sync"
  | "billing"
  | "hosted_mcp"
  | "future_sync";

export type LocalCapability =
  | "messages_import"
  | "local_search"
  | "local_ai"
  | "local_mcp"
  | "local_settings"
  | "local_connectors";

export type CapabilityTier = "local_free" | "local_byok" | "hosted_paid";
export type EmbeddingProvider = "openai" | "hosted" | "local";
export type LLMProvider = "openai" | "hosted";
export type ConnectorProvider = "google_contacts" | "gmail";

export interface IngestionSource {
  kind: SourceKind;
  accountId?: string;
  label: string;
}

export interface FeatureEntitlement {
  capability: LocalCapability | CloudCapability;
  tier: CapabilityTier;
  enabled: boolean;
  requiresAccount: boolean;
  description: string;
}

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

export interface SearchDocumentRecord extends SearchDocument {
  embeddingProvider: EmbeddingProvider | null;
  embeddingModel: string | null;
  contentHash: string;
  embeddedAt: number | null;
  dirty: boolean;
  updatedAt: number;
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
  requiresFullDiskAccess?: boolean;
  openedFullDiskAccessSettings?: boolean;
  revealedInFinder?: boolean;
  accessTargetLabel?: string | null;
}

export interface ContactsAccessStatus {
  status: "granted" | "denied" | "restricted" | "not-determined" | "unsupported";
  details: string;
  canPrompt: boolean;
}

export interface AskResponse {
  answer: string;
  citations: SearchResult[];
  provider: "local" | LLMProvider;
}

export interface ConnectorAccount {
  provider: ConnectorProvider;
  accountId: string;
  label: string;
  scopes: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ConnectorCredential {
  provider: ConnectorProvider;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
  scopes: string[];
  label: string;
}

export interface NormalizedConnectorPerson {
  displayName: string;
  primaryHandle: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
  location?: string | null;
  sourceKind: SourceKind;
  sourceId: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedConnectorInteraction {
  title: string;
  summary: string | null;
  occurredAt: number;
  kind: "email" | "meeting" | "manual";
  sourceKind: SourceKind;
  sourceId: string;
  participantHandles: string[];
  metadata?: Record<string, unknown>;
}

export interface ConnectorSyncResult {
  people: NormalizedConnectorPerson[];
  interactions: NormalizedConnectorInteraction[];
  cursor: Record<string, unknown> | null;
  hasMore: boolean;
}

export interface ContactsSyncSummary {
  importedContacts: number;
  peopleImported: number;
  interactionsImported: number;
}

export interface MessageDetail {
  id: string;
  threadId: string;
  personId: string | null;
  body: string | null;
  occurredAt: number;
  isFromMe: boolean;
  hasAttachments: boolean;
}

export interface ThreadDetail {
  thread: MessageThread;
  participants: Array<{ personId: string; displayName: string; handle: string }>;
  totalMessageCount: number;
}

export interface SyncWatcherState {
  watching: boolean;
  chatDbPath: string | null;
  lastSyncAt: number | null;
  pendingSync: boolean;
}

export interface LocalEmbeddingStatus {
  ready: boolean;
  modelId: string;
  modelsDir: string;
  modelDownloaded: boolean;
  error: string | null;
}

/* ─── Analytics types (mirrored from core/analytics.ts) ─── */

export interface RelationshipStats {
  personId: string;
  displayName: string;
  totalMessages: number;
  sentByMe: number;
  sentByThem: number;
  avgResponseTimeMs: number | null;
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  messagesByMonth: Array<{ month: string; count: number }>;
  messagesByHour: number[];
  streakWeeks: number;
}

export interface WrappedSummary {
  periodLabel: string;
  totalMessages: number;
  totalConversations: number;
  topContacts: RelationshipStats[];
  busiestMonth: { month: string; count: number } | null;
  busiestHour: { hour: number; count: number } | null;
  avgDailyMessages: number;
  messagesByMonth: Array<{ month: string; count: number }>;
  messagesByDayOfWeek: number[];
}

export interface MessageHeatmapEntry {
  date: string;
  count: number;
}

export interface ThreadListItem {
  threadId: string;
  title: string;
  participantHandles: string[];
  lastMessagePreview: string | null;
  lastMessageAt: number | null;
  participantCount: number;
}

export interface OpenFolioBridge {
  dashboard: {
    getThreadSummaries(limit?: number): Promise<MessagesThreadSummary[]>;
    getReminderSuggestions(limit?: number): Promise<ReminderSuggestion[]>;
  };
  messages: {
    requestAccess(): Promise<MessagesAccessStatus>;
    getAccessStatus(): Promise<MessagesAccessStatus>;
    openSettings(): Promise<MessagesAccessStatus>;
    startImport(): Promise<MessagesImportJob>;
    getImportStatus(jobId: string): Promise<MessagesImportJob | null>;
  };
  contacts: {
    requestAccess(): Promise<ContactsAccessStatus>;
    getAccessStatus(): Promise<ContactsAccessStatus>;
    sync(): Promise<ContactsSyncSummary>;
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
  connectorCredentials: {
    listAccounts(): Promise<ConnectorAccount[]>;
    saveCredential(input: ConnectorCredential): Promise<ConnectorAccount>;
    deleteCredential(input: { provider: ConnectorProvider; accountId: string }): Promise<{ ok: boolean }>;
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
  threads: {
    list(input: { limit?: number; offset?: number }): Promise<ThreadListItem[]>;
    getDetail(threadId: string): Promise<ThreadDetail | null>;
    getMessages(input: { threadId: string; limit?: number; offset?: number }): Promise<MessageDetail[]>;
  };
  sync: {
    getWatcherState(): Promise<SyncWatcherState>;
    startWatcher(): Promise<SyncWatcherState>;
    stopWatcher(): Promise<SyncWatcherState>;
    triggerSync(): Promise<MessagesImportJob>;
    onSyncComplete(listener: (job: MessagesImportJob) => void): () => void;
  };
  embeddings: {
    getStatus(): Promise<LocalEmbeddingStatus>;
  };
  insights: {
    getWrappedSummary(year?: number): Promise<WrappedSummary>;
    getTopContacts(limit?: number): Promise<RelationshipStats[]>;
    getRelationshipStats(personId: string): Promise<RelationshipStats | null>;
    getMessageHeatmap(year?: number): Promise<MessageHeatmapEntry[]>;
  };
}
