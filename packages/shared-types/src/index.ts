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

export interface MessageAttachment {
  id: LocalEntityId;
  path: string | null;
  mimeType: string | null;
  transferName: string | null;
}

export interface Person {
  id: LocalEntityId;
  displayName: string;
  primaryHandle: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
  location?: string | null;
  sourceKinds?: SourceKind[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonAlias {
  id: LocalEntityId;
  personId: LocalEntityId;
  value: string;
  kind: "handle" | "name" | "other";
  createdAt: number;
}

export interface EditablePersonProfile {
  displayName?: string;
  primaryHandle?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
  location?: string | null;
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
  pinned: boolean;
  pinnedAt: number | null;
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

export type SearchResultType = "message" | "person" | "conversation";

export interface SearchDateRange {
  /** Inclusive Unix timestamp in milliseconds. */
  startAt?: number | null;
  /** Exclusive Unix timestamp in milliseconds. */
  endAt?: number | null;
}

export interface SearchQueryInput {
  text: string;
  limit?: number;
  resultTypes?: SearchResultType[];
  personIds?: string[];
  threadId?: string | null;
  dateRange?: SearchDateRange | null;
}

export type SearchMatchReason = "exact_words" | "related_wording" | "person" | "conversation_title";

export interface SearchScoreComponents {
  exact: boolean;
  semantic: boolean;
  textScore: number;
  semanticScore: number;
}

export type SearchNavigationTarget =
  | { view: "conversations"; threadId: string; messageId: string | null }
  | { view: "people"; personId: string };

export interface SearchCitation {
  sourceEntityId: string;
  personId: string | null;
  personLabel: string | null;
  threadId: string | null;
  conversationLabel: string | null;
  messageId: string | null;
  occurredAt: number | null;
}

export interface SearchResult {
  id: string;
  kind: SearchDocument["kind"];
  resultType: SearchResultType;
  entityId: string;
  sourceEntityId: string;
  title: string;
  primaryLabel: string;
  snippet: string;
  score: number;
  scoreComponents: SearchScoreComponents;
  matchReason: SearchMatchReason;
  direction: "incoming" | "outgoing" | null;
  senderLabel: string | null;
  citation: SearchCitation;
  navigationTarget: SearchNavigationTarget;
  threadId?: string | null;
  messageId?: string | null;
  personId?: string | null;
  sourceLabel?: string | null;
  occurredAt?: number | null;
}

export interface SearchResponse {
  state: "results" | "empty" | "error";
  results: SearchResult[];
  resultCount: number;
  retrievalMode: "hybrid" | "exact";
  semanticStatus: "ready" | "indexing" | "unavailable";
  semanticMessage: string | null;
  error: {
    code: "invalid_filters" | "local_index_unavailable";
    message: string;
    details: string | null;
  } | null;
}

export interface ConversationCitationInput {
  threadId: string;
  messageId: string;
  before?: number;
  after?: number;
}

export interface ConversationCitationContext {
  thread: ThreadDetail;
  citedMessageId: string;
  messages: MessageDetail[];
  citedMessageIndex: number;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface AskRunInput {
  query: string;
  useHosted?: boolean;
  sourceScope?: "all" | "person" | "thread";
  personId?: string | null;
  threadId?: string | null;
}

export interface MessagesImportJob {
  id: string;
  status: "idle" | "running" | "cancelling" | "cancelled" | "completed" | "failed";
  importedMessages: number;
  importedThreads: number;
  importedPeople: number;
  lastCursor: number | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

export interface SearchScaleStatus {
  totalDocuments: number;
  embeddedDocuments: number;
  dirtyDocuments: number;
  vectorScanWarningThreshold: number;
  recommendVectorIndex: boolean;
  estimatedVectorBytes: number;
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

export interface LocalDataStatus {
  databasePath: string;
  backupDirectoryPath: string;
  backupCount: number;
  latestBackupName: string | null;
}

export interface DiagnosticsReport {
  generatedAt: number;
  appVersion: string;
  platform: string;
  osRelease: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  messagesStatus: Pick<MessagesAccessStatus, "status" | "requiresFullDiskAccess" | "chatDbPath">;
  contactsStatus: Pick<ContactsAccessStatus, "status">;
  updateState: UpdateState;
  localData: LocalDataStatus;
  watcherState: SyncWatcherState;
  activeImport: Pick<MessagesImportJob, "status" | "importedMessages" | "importedPeople" | "importedThreads" | "lastCursor" | "startedAt" | "completedAt"> | null;
  embeddingSync: EmbeddingSyncStatus;
  mcpStatus: McpRuntimeStatus;
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
  sourceScope?: AskRunInput["sourceScope"];
}

export interface AiSettingsStatus {
  provider: "local" | "openai";
  hasOpenAIKey: boolean;
  answerModel: string | null;
  embeddingModel: string | null;
  useOpenAIEmbeddings: boolean;
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
  attachments: MessageAttachment[];
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

export interface EmbeddingSyncStatus {
  totalDocuments: number;
  embeddedDocuments: number;
  dirtyDocuments: number;
  provider: EmbeddingProvider | null;
  model: string | null;
  syncing: boolean;
  lastError: string | null;
}

export interface EmbeddingPriority {
  startAt: number | null;
  endAt: number | null;
  personIds: string[];
}

export interface EmbeddingPlanStats {
  priority: EmbeddingPriority;
  priorityConfigured: boolean;
  earliestMessageAt: number | null;
  latestMessageAt: number | null;
  selectedMessages: number;
  selectedConversations: number;
  selectedDirtyDocuments: number;
  selectedEmbeddedDocuments: number;
  documentsPerSecond: number | null;
  estimatedSeconds: number | null;
  estimateIsCalibrated: boolean;
  timeline: Array<{ month: string; startAt: number; count: number }>;
  people: Array<{ id: string; displayName: string; messageCount: number }>;
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

export interface PersonProfile {
  person: Person;
  aliases: PersonAlias[];
  digest: RelationshipDigest;
  stats: RelationshipStats | null;
  summary: {
    firstContactAt: number | null;
    lastContactAt: number | null;
    cadenceLabel: string;
    sentReceivedLabel: string;
    responseLabel: string;
  };
  threads: ThreadListItem[];
  recentMessages: MessageDetail[];
  notes: Note[];
  reminders: Reminder[];
}

export interface McpSetupStatus {
  available: boolean;
  command: string;
  clients: Array<{
    id: "claude" | "cursor" | "codex" | "chatgpt";
    name: string;
    config: string;
  }>;
  details: string;
}

export interface McpRuntimeStatus {
  running: boolean;
  mode: "stdio";
  available: boolean;
  command: string;
  details: string;
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
    getActiveImport(): Promise<MessagesImportJob | null>;
    cancelImport(jobId: string): Promise<MessagesImportJob | null>;
    retryImport(jobId?: string | null): Promise<MessagesImportJob>;
  };
  contacts: {
    requestAccess(): Promise<ContactsAccessStatus>;
    getAccessStatus(): Promise<ContactsAccessStatus>;
    sync(): Promise<ContactsSyncSummary>;
  };
  search: {
    query(input: { text: string; limit?: number }): Promise<SearchResult[]>;
    queryArchive(input: SearchQueryInput): Promise<SearchResponse>;
    getCitationContext(input: ConversationCitationInput): Promise<ConversationCitationContext>;
    getScaleStatus(): Promise<SearchScaleStatus>;
  };
  updates: {
    getState(): Promise<UpdateState>;
    checkNow(): Promise<UpdateState>;
    installNow(): Promise<void>;
    onStateChange(listener: (state: UpdateState) => void): () => void;
  };
  localData: {
    getStatus(): Promise<LocalDataStatus>;
    revealDatabase(): Promise<void>;
    revealBackups(): Promise<void>;
  };
  diagnostics: {
    getReport(): Promise<DiagnosticsReport>;
  };
  mcp: {
    getStatus(): Promise<McpRuntimeStatus>;
    start(): Promise<McpRuntimeStatus>;
    stop(): Promise<McpRuntimeStatus>;
    getSetup(): Promise<McpSetupStatus>;
  };
  people: {
    list(input?: { limit?: number; query?: string }): Promise<Person[]>;
    getProfile(personId: string): Promise<PersonProfile | null>;
    updateProfile(input: { personId: string; profile: EditablePersonProfile }): Promise<PersonProfile | null>;
    addAlias(input: { personId: string; value: string; kind?: PersonAlias["kind"] }): Promise<PersonAlias>;
    deleteAlias(input: { aliasId: string }): Promise<{ ok: boolean }>;
    searchMessages(input: { personId: string; query?: string; limit?: number; offset?: number }): Promise<MessageDetail[]>;
    addNote(input: { personId: string; content: string }): Promise<Note>;
    addReminder(input: { personId: string; title: string; dueAt?: number | null }): Promise<Reminder>;
  };
  notes: {
    pin(noteId: string): Promise<Note | null>;
    unpin(noteId: string): Promise<Note | null>;
  };
  reminders: {
    updateStatus(input: { reminderId: string; status: Reminder["status"] }): Promise<Reminder | null>;
  };
  threads: {
    list(input: { limit?: number; offset?: number }): Promise<ThreadListItem[]>;
    getDetail(threadId: string): Promise<ThreadDetail | null>;
    getMessages(input: { threadId: string; limit?: number; offset?: number; aroundMessageId?: string | null; direction?: "older" | "newer" }): Promise<MessageDetail[]>;
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
    getSyncStatus(): Promise<EmbeddingSyncStatus>;
    getPlan(): Promise<EmbeddingPlanStats>;
    setPriority(priority: EmbeddingPriority): Promise<EmbeddingPlanStats>;
    syncNow(): Promise<EmbeddingSyncStatus>;
  };
  insights: {
    getWrappedSummary(year?: number): Promise<WrappedSummary>;
    getTopContacts(limit?: number): Promise<RelationshipStats[]>;
    getRelationshipStats(personId: string): Promise<RelationshipStats | null>;
    getMessageHeatmap(year?: number): Promise<MessageHeatmapEntry[]>;
  };
}
