import { create } from "zustand";
import type {
  ContactsAccessStatus,
  ContactsSyncSummary,
  CloudAccountStatus,
  CloudRuntimeConfig,
  MessagesAccessStatus,
  MessagesImportJob,
  MessagesThreadSummary,
  ReminderSuggestion,
  SearchResult,
  SyncWatcherState,
  ThreadListItem,
  UpdateState,
} from "@openfolio/shared-types";

/* ─── Navigation ─── */

export type View = "inbox" | "insights" | "settings";

/* ─── Command palette ─── */

export interface CommandPaletteState {
  open: boolean;
  query: string;
  results: SearchResult[];
  searching: boolean;
}

/* ─── Store ─── */

export interface AppState {
  // Navigation
  view: View;
  setView: (view: View) => void;

  // Selected thread
  selectedThreadId: string | null;
  selectThread: (threadId: string | null) => void;

  // Command palette
  commandPalette: CommandPaletteState;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandQuery: (query: string) => void;
  setCommandResults: (results: SearchResult[], searching?: boolean) => void;

  // Data
  threads: ThreadListItem[];
  setThreads: (threads: ThreadListItem[]) => void;
  threadSummaries: MessagesThreadSummary[];
  setThreadSummaries: (summaries: MessagesThreadSummary[]) => void;
  suggestions: ReminderSuggestion[];
  setSuggestions: (suggestions: ReminderSuggestion[]) => void;

  // Access / status
  messagesStatus: MessagesAccessStatus | null;
  setMessagesStatus: (status: MessagesAccessStatus | null) => void;
  contactsStatus: ContactsAccessStatus | null;
  setContactsStatus: (status: ContactsAccessStatus | null) => void;
  contactsSync: ContactsSyncSummary | null;
  setContactsSync: (sync: ContactsSyncSummary | null) => void;

  // Sync watcher
  watcherState: SyncWatcherState | null;
  setWatcherState: (state: SyncWatcherState | null) => void;

  // Cloud
  cloudConfig: CloudRuntimeConfig | null;
  setCloudConfig: (config: CloudRuntimeConfig | null) => void;
  cloudStatus: CloudAccountStatus | undefined;
  setCloudStatus: (status: CloudAccountStatus | undefined) => void;
  cloudError: string | null;
  setCloudError: (error: string | null) => void;

  // Import
  importJob: MessagesImportJob | null;
  setImportJob: (job: MessagesImportJob | null) => void;

  // MCP
  mcpRunning: boolean;
  setMcpRunning: (running: boolean) => void;

  // Updates
  updateState: UpdateState | null;
  setUpdateState: (state: UpdateState | null) => void;

  // UI
  busy: boolean;
  setBusy: (busy: boolean) => void;
  initialized: boolean;
  setInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  view: "inbox",
  setView: (view) => set({ view, selectedThreadId: null }),

  // Selected thread
  selectedThreadId: null,
  selectThread: (threadId) => set({ selectedThreadId: threadId }),

  // Command palette
  commandPalette: { open: false, query: "", results: [], searching: false },
  openCommandPalette: () =>
    set((s) => ({
      commandPalette: { ...s.commandPalette, open: true, query: "", results: [], searching: false },
    })),
  closeCommandPalette: () =>
    set((s) => ({
      commandPalette: { ...s.commandPalette, open: false },
    })),
  setCommandQuery: (query) =>
    set((s) => ({
      commandPalette: { ...s.commandPalette, query, searching: query.length > 0 },
    })),
  setCommandResults: (results, searching = false) =>
    set((s) => ({
      commandPalette: { ...s.commandPalette, results, searching },
    })),

  // Data
  threads: [],
  setThreads: (threads) => set({ threads }),
  threadSummaries: [],
  setThreadSummaries: (threadSummaries) => set({ threadSummaries }),
  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),

  // Access / status
  messagesStatus: null,
  setMessagesStatus: (messagesStatus) => set({ messagesStatus }),
  contactsStatus: null,
  setContactsStatus: (contactsStatus) => set({ contactsStatus }),
  contactsSync: null,
  setContactsSync: (contactsSync) => set({ contactsSync }),

  // Sync watcher
  watcherState: null,
  setWatcherState: (watcherState) => set({ watcherState }),

  // Cloud
  cloudConfig: null,
  setCloudConfig: (cloudConfig) => set({ cloudConfig }),
  cloudStatus: undefined,
  setCloudStatus: (cloudStatus) => set({ cloudStatus }),
  cloudError: null,
  setCloudError: (cloudError) => set({ cloudError }),

  // Import
  importJob: null,
  setImportJob: (importJob) => set({ importJob }),

  // MCP
  mcpRunning: false,
  setMcpRunning: (mcpRunning) => set({ mcpRunning }),

  // Updates
  updateState: null,
  setUpdateState: (updateState) => set({ updateState }),

  // UI
  busy: false,
  setBusy: (busy) => set({ busy }),
  initialized: false,
  setInitialized: (initialized) => set({ initialized }),
}));
