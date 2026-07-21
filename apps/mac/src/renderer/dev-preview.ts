import type {
  MessageDetail,
  OpenFolioBridge,
  Person,
  PersonProfile,
  SearchResult,
  ThreadDetail,
  ThreadListItem,
  WrappedSummary,
} from "@openfolio/shared-types";
import { useAppStore, type View } from "./store";

const now = new Date("2026-07-21T18:00:00-07:00").getTime();
const day = 86_400_000;

const people: Person[] = [
  {
    id: "person-jordan",
    displayName: "Jordan Lee",
    primaryHandle: "+1 (415) 555-0142",
    email: "jordan@example.com",
    phone: "+1 (415) 555-0142",
    companyName: "Northstar Studio",
    jobTitle: "Design lead",
    location: "San Francisco",
    createdAt: now - 800 * day,
    updatedAt: now - day,
  },
  {
    id: "person-maya",
    displayName: "Maya Chen",
    primaryHandle: "maya@example.com",
    email: "maya@example.com",
    createdAt: now - 640 * day,
    updatedAt: now - 3 * day,
  },
  {
    id: "person-alex",
    displayName: "Alex Rivera",
    primaryHandle: "+1 (212) 555-0199",
    phone: "+1 (212) 555-0199",
    createdAt: now - 500 * day,
    updatedAt: now - 8 * day,
  },
  {
    id: "person-long",
    displayName: "Christopher Montgomery-Wellington",
    primaryHandle: "christopher.montgomery-wellington@verylongdomain.example",
    email: "christopher.montgomery-wellington@verylongdomain.example",
    createdAt: now - 420 * day,
    updatedAt: now - 12 * day,
  },
];

const threads: ThreadListItem[] = [
  {
    threadId: "thread-weekend",
    title: "Jordan Lee",
    participantHandles: ["+1 (415) 555-0142"],
    lastMessagePreview: "the place was Mensho Tokyo on Geary, go before six",
    lastMessageAt: now - day,
    participantCount: 1,
  },
  {
    threadId: "thread-trip",
    title: "Tokyo planning",
    participantHandles: ["maya@example.com", "+1 (212) 555-0199"],
    lastMessagePreview: "I saved the hotel and the late train options in the note",
    lastMessageAt: now - 3 * day,
    participantCount: 2,
  },
  {
    threadId: "thread-long",
    title: "Christopher Montgomery-Wellington and the neighborhood volunteer planning committee",
    participantHandles: ["christopher.montgomery-wellington@verylongdomain.example"],
    lastMessagePreview: "This deliberately long preview verifies that dates and actions remain visible without horizontal overflow.",
    lastMessageAt: now - 12 * day,
    participantCount: 4,
  },
];

const messages: MessageDetail[] = [
  {
    id: "message-1",
    threadId: "thread-weekend",
    personId: "person-jordan",
    body: "the place was Mensho Tokyo on Geary, go before six because the line gets wild",
    occurredAt: now - day - 3_600_000,
    isFromMe: false,
    hasAttachments: false,
    attachments: [],
  },
  {
    id: "message-2",
    threadId: "thread-weekend",
    personId: null,
    body: "perfect, that was the ramen place I was trying to remember",
    occurredAt: now - day - 3_300_000,
    isFromMe: true,
    hasAttachments: false,
    attachments: [],
  },
  {
    id: "message-3",
    threadId: "thread-weekend",
    personId: "person-jordan",
    body: "also get the spicy miso. it is better than the regular bowl",
    occurredAt: now - day - 3_000_000,
    isFromMe: false,
    hasAttachments: false,
    attachments: [],
  },
];

const searchResults: SearchResult[] = [
  {
    id: "result-message",
    kind: "message",
    resultType: "message",
    entityId: "message-1",
    sourceEntityId: "message-1",
    title: "Jordan Lee",
    primaryLabel: "Jordan Lee",
    snippet: "the place was Mensho Tokyo on Geary, go before six because the line gets wild",
    score: 0.96,
    scoreComponents: { exact: false, semantic: true, textScore: 0.72, semanticScore: 0.96 },
    matchReason: "related_wording",
    direction: "incoming",
    senderLabel: "Jordan Lee",
    citation: {
      sourceEntityId: "message-1",
      personId: "person-jordan",
      personLabel: "Jordan Lee",
      threadId: "thread-weekend",
      conversationLabel: "Jordan Lee",
      messageId: "message-1",
      occurredAt: now - day - 3_600_000,
    },
    navigationTarget: { view: "conversations", threadId: "thread-weekend", messageId: "message-1" },
    threadId: "thread-weekend",
    messageId: "message-1",
    personId: "person-jordan",
    occurredAt: now - day - 3_600_000,
  },
  {
    id: "result-thread",
    kind: "thread",
    resultType: "conversation",
    entityId: "thread-trip",
    sourceEntityId: "thread-trip",
    title: "Tokyo planning",
    primaryLabel: "Tokyo planning",
    snippet: "hotel options, the red-eye flight, ramen, and the late train from the airport",
    score: 0.82,
    scoreComponents: { exact: true, semantic: true, textScore: 0.81, semanticScore: 0.74 },
    matchReason: "conversation_title",
    direction: null,
    senderLabel: null,
    citation: {
      sourceEntityId: "thread-trip",
      personId: null,
      personLabel: null,
      threadId: "thread-trip",
      conversationLabel: "Tokyo planning",
      messageId: null,
      occurredAt: now - 3 * day,
    },
    navigationTarget: { view: "conversations", threadId: "thread-trip", messageId: null },
    threadId: "thread-trip",
    occurredAt: now - 3 * day,
  },
  {
    id: "result-person",
    kind: "person",
    resultType: "person",
    entityId: "person-long",
    sourceEntityId: "person-long",
    title: "Christopher Montgomery-Wellington",
    primaryLabel: "Christopher Montgomery-Wellington",
    snippet: "Mentioned ramen during the neighborhood volunteer planning conversation.",
    score: 0.7,
    scoreComponents: { exact: true, semantic: false, textScore: 0.7, semanticScore: 0 },
    matchReason: "person",
    direction: null,
    senderLabel: null,
    citation: {
      sourceEntityId: "person-long",
      personId: "person-long",
      personLabel: "Christopher Montgomery-Wellington",
      threadId: "thread-long",
      conversationLabel: threads[2].title,
      messageId: null,
      occurredAt: now - 12 * day,
    },
    navigationTarget: { view: "people", personId: "person-long" },
    personId: "person-long",
    occurredAt: now - 12 * day,
  },
];

function profileFor(personId: string): PersonProfile | null {
  const person = people.find((item) => item.id === personId);
  if (!person) return null;
  const relatedThreads = personId === "person-jordan" ? [threads[0]] : personId === "person-long" ? [threads[2]] : [threads[1]];
  return {
    person,
    aliases: [],
    digest: {
      personId,
      displayName: person.displayName,
      lastContactAt: person.updatedAt,
      messageCount: personId === "person-jordan" ? 1842 : 428,
      noteCount: 0,
      reminderCount: 0,
    },
    stats: {
      personId,
      displayName: person.displayName,
      totalMessages: personId === "person-jordan" ? 1842 : 428,
      sentByMe: 740,
      sentByThem: 1102,
      avgResponseTimeMs: 480_000,
      firstMessageAt: now - 700 * day,
      lastMessageAt: person.updatedAt,
      messagesByMonth: Array.from({ length: 24 }, (_, index) => ({
        month: `202${4 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
        count: 24 + ((index * 17) % 90),
      })),
      messagesByHour: Array.from({ length: 24 }, (_, index) => (index * 7) % 40),
      streakWeeks: 18,
    },
    summary: {
      firstContactAt: now - 700 * day,
      lastContactAt: person.updatedAt,
      cadenceLabel: "A few times a week",
      sentReceivedLabel: "740 sent / 1,102 received",
      responseLabel: "Usually within 8 minutes",
    },
    threads: relatedThreads,
    recentMessages: messages,
    notes: [],
    reminders: [],
  };
}

const wrapped: WrappedSummary = {
  periodLabel: "2026",
  totalMessages: 28_416,
  totalConversations: 327,
  topContacts: people.slice(0, 3).map((person, index) => ({
    personId: person.id,
    displayName: person.displayName,
    totalMessages: 1842 - index * 367,
    sentByMe: 700 - index * 80,
    sentByThem: 1142 - index * 287,
    avgResponseTimeMs: 420_000,
    firstMessageAt: now - 600 * day,
    lastMessageAt: now - index * 4 * day,
    messagesByMonth: [],
    messagesByHour: [],
    streakWeeks: 12,
  })),
  busiestMonth: { month: "2026-05", count: 3418 },
  busiestHour: { hour: 20, count: 2140 },
  avgDailyMessages: 78,
  messagesByMonth: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    count: 1300 + ((index * 683) % 2200),
  })),
  messagesByDayOfWeek: [2400, 4200, 4700, 5100, 4900, 4300, 2816],
};

const detail: ThreadDetail = {
  thread: {
    id: "thread-weekend",
    sourceChatId: "preview-chat",
    displayName: "Jordan Lee",
    participantCount: 1,
    lastMessageAt: now - day,
  },
  participants: [
    { personId: "person-jordan", displayName: "Jordan Lee", handle: "+1 (415) 555-0142" },
  ],
  totalMessageCount: 1842,
};

function readAppPreview(): View | null {
  const value = new URLSearchParams(window.location.search).get("app-preview");
  return ["search", "people", "conversations", "wrapped", "settings"].includes(
    value || "",
  )
    ? (value as View)
    : null;
}

export function installDevPreviewBridge() {
  const preview = readAppPreview();
  if (!preview || window.openfolio) return;

  const bridge = {
    dashboard: {
      getThreadSummaries: async () => threads,
      getReminderSuggestions: async () => [],
    },
    messages: {
      requestAccess: async () => ({ status: "granted", chatDbPath: "/Users/you/Library/Messages/chat.db", details: "Messages access granted." }),
      getAccessStatus: async () => ({ status: "granted", chatDbPath: "/Users/you/Library/Messages/chat.db", details: "Messages access granted." }),
      startImport: async () => completedImport,
      getActiveImport: async () => completedImport,
      getImportStatus: async () => completedImport,
      cancelImport: async () => completedImport,
      retryImport: async () => completedImport,
      openSettings: async () => ({ status: "granted", chatDbPath: "/Users/you/Library/Messages/chat.db", details: "Messages access granted." }),
    },
    contacts: {
      requestAccess: async () => ({ status: "granted", details: "Granted", canPrompt: true }),
      getAccessStatus: async () => ({ status: "granted", details: "Granted", canPrompt: true }),
      sync: async () => ({ importedContacts: 184, peopleImported: 184, interactionsImported: 0 }),
    },
    search: {
      query: async () => searchResults,
      queryArchive: async (input: { text: string }) => {
        if (input.text.toLowerCase().includes("error")) {
          return {
            state: "error" as const,
            results: [],
            resultCount: 0,
            retrievalMode: "exact" as const,
            semanticStatus: "unavailable" as const,
            semanticMessage: null,
            error: {
              code: "local_index_unavailable" as const,
              message: "Preview search failure",
              details: null,
            },
          };
        }
        if (input.text.toLowerCase().includes("nothing")) {
          return {
            state: "empty" as const,
            results: [],
            resultCount: 0,
            retrievalMode: "hybrid" as const,
            semanticStatus: "ready" as const,
            semanticMessage: null,
            error: null,
          };
        }
        return {
          state: "results" as const,
          results: searchResults,
          resultCount: searchResults.length,
          retrievalMode: "hybrid" as const,
          semanticStatus: "ready" as const,
          semanticMessage: null,
          error: null,
        };
      },
      getCitationContext: async () => ({ thread: detail, citedMessageId: "message-1", messages, citedMessageIndex: 0, hasOlder: true, hasNewer: true }),
      getScaleStatus: async () => ({ totalDocuments: 28_743, embeddedDocuments: 28_743, dirtyDocuments: 0, vectorScanWarningThreshold: 100_000, recommendVectorIndex: false, estimatedVectorBytes: 44_000_000 }),
    },
    people: {
      list: async (input?: { query?: string }) => people.filter((person) => !input?.query || `${person.displayName} ${person.primaryHandle}`.toLowerCase().includes(input.query.toLowerCase())),
      getProfile: async (personId: string) => profileFor(personId),
      updateProfile: async ({ personId }: { personId: string }) => profileFor(personId),
    },
    threads: {
      list: async () => threads,
      getDetail: async (threadId: string) => ({ ...detail, thread: { ...detail.thread, id: threadId, displayName: threads.find((thread) => thread.threadId === threadId)?.title || "Conversation" } }),
      getMessages: async () => messages,
    },
    insights: {
      getWrappedSummary: async (year?: number) =>
        year && year < 2026
          ? {
              ...wrapped,
              periodLabel: String(year),
              totalMessages: 0,
              totalConversations: 0,
              topContacts: [],
              busiestMonth: null,
              avgDailyMessages: 0,
              messagesByMonth: [],
              messagesByDayOfWeek: Array.from({ length: 7 }, () => 0),
            }
          : wrapped,
      getMessageHeatmap: async () => Array.from({ length: 180 }, (_, index) => ({ date: new Date(now - (179 - index) * day).toISOString().slice(0, 10), count: (index * 13) % 84 })),
    },
    sync: {
      getWatcherState: async () => ({ watching: true, chatDbPath: "/Users/you/Library/Messages/chat.db", lastSyncAt: now, pendingSync: false }),
      startWatcher: async () => ({ watching: true, chatDbPath: "/Users/you/Library/Messages/chat.db", lastSyncAt: now, pendingSync: false }),
      onSyncComplete: () => () => {},
    },
    embeddings: {
      getSyncStatus: async () => embeddingStatus,
      syncNow: async () => embeddingStatus,
    },
    mcp: {
      getStatus: async () => ({ running: false, mode: "stdio", available: true, command: "openfolio-mcp", details: "Available locally" }),
      getSetup: async () => ({ available: true, command: "openfolio-mcp", clients: [{ id: "codex", name: "Codex", config: "preview configuration" }], details: "Available locally" }),
    },
    localData: {
      getStatus: async () => ({ databasePath: "/Users/you/Library/Application Support/OpenFolio/openfolio.db", backupDirectoryPath: "/Users/you/Library/Application Support/OpenFolio/backups", backupCount: 2, latestBackupName: "openfolio-before-migration.db" }),
      revealDatabase: async () => {},
    },
    updates: {
      getState: async () => updateState,
      onStateChange: () => () => {},
    },
  } as unknown as OpenFolioBridge;

  window.openfolio = bridge;

  useAppStore.setState({
    view: preview,
    introSeen: true,
    setupDismissed: true,
    selectedPersonId: preview === "people" ? "person-jordan" : null,
    selectedThreadId:
      preview === "conversations" ? "thread-weekend" : null,
  });
  if (preview === "search") {
    useAppStore.getState().setSearchQuery("ramen place Jordan recommended");
  }
}

const completedImport = {
  id: "preview-complete",
  status: "completed" as const,
  importedMessages: 28_416,
  importedPeople: 184,
  importedThreads: 327,
  lastCursor: 28_416,
  error: null,
  startedAt: now - day,
  completedAt: now - day + 120_000,
};

const embeddingStatus = {
  totalDocuments: 28_743,
  embeddedDocuments: 28_743,
  dirtyDocuments: 0,
  provider: "local" as const,
  model: "all-MiniLM-L6-v2",
  syncing: false,
  lastError: null,
};

const updateState = {
  status: "unsupported" as const,
  currentVersion: "0.4.0",
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  message: "Manual updates",
  checkedAt: null,
};
