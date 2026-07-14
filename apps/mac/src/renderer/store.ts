import { create } from "zustand";
import type {
  ContactsAccessStatus,
  ContactsSyncSummary,
  EmbeddingSyncStatus,
  McpRuntimeStatus,
  MessagesAccessStatus,
  MessagesImportJob,
  MessagesThreadSummary,
  SearchResult,
  SearchResponse,
  SyncWatcherState,
  ThreadListItem,
  UpdateState,
} from "@openfolio/shared-types";

function readSetupDismissed() {
  return typeof localStorage !== "undefined" && localStorage.getItem("openfolio.setupDismissed") === "1";
}

function writeSetupDismissed(value: boolean) {
  if (typeof localStorage !== "undefined") localStorage.setItem("openfolio.setupDismissed", value ? "1" : "0");
}

export type View = "search" | "people" | "conversations" | "wrapped" | "settings";
export type SearchType = "all" | "messages" | "people" | "conversations";
export type SearchDate = "any" | "this-year" | "last-year" | "custom";

export interface SearchFilters {
  type: SearchType;
  personId: string | null;
  threadId: string | null;
  date: SearchDate;
  customStart: string;
  customEnd: string;
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  searching: boolean;
  error: string | null;
  selectedResultId: string | null;
  filters: SearchFilters;
  focusRequest: number;
  retrievalMode: SearchResponse["retrievalMode"];
  semanticStatus: SearchResponse["semanticStatus"];
  semanticMessage: string | null;
  resultCount: number;
}

export interface AppState {
  view: View;
  setView: (view: View) => void;
  navigateToSearch: (query?: string) => void;
  selectedThreadId: string | null;
  selectThread: (threadId: string | null) => void;
  selectedMessageId: string | null;
  selectMessage: (messageId: string | null) => void;
  selectedPersonId: string | null;
  selectPerson: (personId: string | null) => void;
  search: SearchState;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setSearchResponse: (response: SearchResponse) => void;
  setSearching: (searching: boolean) => void;
  setSearchError: (error: string | null) => void;
  selectSearchResult: (id: string | null) => void;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  clearSearchFilters: () => void;
  threads: ThreadListItem[];
  setThreads: (threads: ThreadListItem[]) => void;
  threadSummaries: MessagesThreadSummary[];
  setThreadSummaries: (summaries: MessagesThreadSummary[]) => void;
  messagesStatus: MessagesAccessStatus | null;
  setMessagesStatus: (status: MessagesAccessStatus | null) => void;
  contactsStatus: ContactsAccessStatus | null;
  setContactsStatus: (status: ContactsAccessStatus | null) => void;
  contactsSync: ContactsSyncSummary | null;
  setContactsSync: (sync: ContactsSyncSummary | null) => void;
  watcherState: SyncWatcherState | null;
  setWatcherState: (state: SyncWatcherState | null) => void;
  importJob: MessagesImportJob | null;
  setImportJob: (job: MessagesImportJob | null) => void;
  mcpStatus: McpRuntimeStatus | null;
  setMcpStatus: (status: McpRuntimeStatus | null) => void;
  embeddingSync: EmbeddingSyncStatus | null;
  setEmbeddingSync: (status: EmbeddingSyncStatus | null) => void;
  updateState: UpdateState | null;
  setUpdateState: (state: UpdateState | null) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  initialized: boolean;
  setInitialized: (initialized: boolean) => void;
  setupDismissed: boolean;
  setSetupDismissed: (dismissed: boolean) => void;
}

const initialFilters: SearchFilters = {
  type: "all",
  personId: null,
  threadId: null,
  date: "any",
  customStart: "",
  customEnd: "",
};

export const useAppStore = create<AppState>((set) => ({
  view: "search",
  setView: (view) => set({ view }),
  navigateToSearch: (query) => set((state) => ({
    view: "search",
    search: { ...state.search, query: query ?? state.search.query, focusRequest: state.search.focusRequest + 1 },
  })),
  selectedThreadId: null,
  selectThread: (selectedThreadId) => set({ selectedThreadId }),
  selectedMessageId: null,
  selectMessage: (selectedMessageId) => set({ selectedMessageId }),
  selectedPersonId: null,
  selectPerson: (selectedPersonId) => set({ selectedPersonId }),
  search: {
    query: "",
    results: [],
    searching: false,
    error: null,
    selectedResultId: null,
    filters: initialFilters,
    focusRequest: 1,
    retrievalMode: "exact",
    semanticStatus: "unavailable",
    semanticMessage: null,
    resultCount: 0,
  },
  setSearchQuery: (query) => set((state) => ({ search: { ...state.search, query } })),
  setSearchResults: (results) => set((state) => ({
    search: { ...state.search, results, resultCount: results.length },
  })),
  setSearchResponse: (response) => set((state) => ({
    search: {
      ...state.search,
      results: response.results,
      resultCount: response.resultCount,
      retrievalMode: response.retrievalMode,
      semanticStatus: response.semanticStatus,
      semanticMessage: response.semanticMessage,
    },
  })),
  setSearching: (searching) => set((state) => ({ search: { ...state.search, searching } })),
  setSearchError: (error) => set((state) => ({ search: { ...state.search, error } })),
  selectSearchResult: (selectedResultId) => set((state) => ({ search: { ...state.search, selectedResultId } })),
  setSearchFilters: (filters) => set((state) => ({
    search: { ...state.search, filters: { ...state.search.filters, ...filters }, selectedResultId: null },
  })),
  clearSearchFilters: () => set((state) => ({ search: { ...state.search, filters: initialFilters } })),
  threads: [],
  setThreads: (threads) => set({ threads }),
  threadSummaries: [],
  setThreadSummaries: (threadSummaries) => set({ threadSummaries }),
  messagesStatus: null,
  setMessagesStatus: (messagesStatus) => set({ messagesStatus }),
  contactsStatus: null,
  setContactsStatus: (contactsStatus) => set({ contactsStatus }),
  contactsSync: null,
  setContactsSync: (contactsSync) => set({ contactsSync }),
  watcherState: null,
  setWatcherState: (watcherState) => set({ watcherState }),
  importJob: null,
  setImportJob: (importJob) => set({ importJob }),
  mcpStatus: null,
  setMcpStatus: (mcpStatus) => set({ mcpStatus }),
  embeddingSync: null,
  setEmbeddingSync: (embeddingSync) => set({ embeddingSync }),
  updateState: null,
  setUpdateState: (updateState) => set({ updateState }),
  busy: false,
  setBusy: (busy) => set({ busy }),
  initialized: false,
  setInitialized: (initialized) => set({ initialized }),
  setupDismissed: readSetupDismissed(),
  setSetupDismissed: (setupDismissed) => {
    writeSetupDismissed(setupDismissed);
    set({ setupDismissed });
  },
}));
