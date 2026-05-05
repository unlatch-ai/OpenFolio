import { contextBridge, ipcRenderer } from "electron";
import type { AskRunInput, OpenFolioBridge } from "@openfolio/shared-types";

const bridge: OpenFolioBridge = {
  dashboard: {
    getThreadSummaries: (limit?: number) => ipcRenderer.invoke("openfolio:dashboard:getThreadSummaries", limit),
    getReminderSuggestions: (limit?: number) => ipcRenderer.invoke("openfolio:dashboard:getReminderSuggestions", limit),
  },
  messages: {
    requestAccess: () => ipcRenderer.invoke("openfolio:messages:requestAccess"),
    getAccessStatus: () => ipcRenderer.invoke("openfolio:messages:getAccessStatus"),
    openSettings: () => ipcRenderer.invoke("openfolio:messages:openSettings"),
    startImport: () => ipcRenderer.invoke("openfolio:messages:startImport"),
    getImportStatus: (jobId: string) => ipcRenderer.invoke("openfolio:messages:getImportStatus", jobId),
    getActiveImport: () => ipcRenderer.invoke("openfolio:messages:getActiveImport"),
    cancelImport: (jobId: string) => ipcRenderer.invoke("openfolio:messages:cancelImport", jobId),
    retryImport: (jobId?: string | null) => ipcRenderer.invoke("openfolio:messages:retryImport", jobId),
  },
  contacts: {
    requestAccess: () => ipcRenderer.invoke("openfolio:contacts:requestAccess"),
    getAccessStatus: () => ipcRenderer.invoke("openfolio:contacts:getAccessStatus"),
    sync: () => ipcRenderer.invoke("openfolio:contacts:sync"),
  },
  search: {
    query: (input: { text: string; limit?: number }) => ipcRenderer.invoke("openfolio:search:query", input),
    getScaleStatus: () => ipcRenderer.invoke("openfolio:search:getScaleStatus"),
  },
  ai: {
    run: (input: AskRunInput) => ipcRenderer.invoke("openfolio:ai:run", input),
    getSettings: () => ipcRenderer.invoke("openfolio:ai:getSettings"),
    saveOpenAIKey: (input) => ipcRenderer.invoke("openfolio:ai:saveOpenAIKey", input),
    deleteOpenAIKey: () => ipcRenderer.invoke("openfolio:ai:deleteOpenAIKey"),
  },
  cloud: {
    getConfig: () => ipcRenderer.invoke("openfolio:cloud:getConfig"),
    beginAuthSession: () => ipcRenderer.invoke("openfolio:cloud:beginAuthSession"),
    openExternal: (url: string) => ipcRenderer.invoke("openfolio:cloud:openExternal", url),
    onAuthCallback: (listener: (url: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string) => listener(url);
      ipcRenderer.on("openfolio:cloud:authCallback", handler);
      return () => ipcRenderer.removeListener("openfolio:cloud:authCallback", handler);
    },
  },
  connectorCredentials: {
    listAccounts: () => ipcRenderer.invoke("openfolio:connectors:listAccounts"),
    saveCredential: (input) => ipcRenderer.invoke("openfolio:connectors:saveCredential", input),
    deleteCredential: (input) => ipcRenderer.invoke("openfolio:connectors:deleteCredential", input),
  },
  updates: {
    getState: () => ipcRenderer.invoke("openfolio:updates:getState"),
    checkNow: () => ipcRenderer.invoke("openfolio:updates:checkNow"),
    installNow: () => ipcRenderer.invoke("openfolio:updates:installNow"),
    onStateChange: (listener: (state: import("@openfolio/shared-types").UpdateState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: import("@openfolio/shared-types").UpdateState) => listener(state);
      ipcRenderer.on("openfolio:updates:state", handler);
      return () => ipcRenderer.removeListener("openfolio:updates:state", handler);
    },
  },
  localData: {
    getStatus: () => ipcRenderer.invoke("openfolio:localData:getStatus"),
    revealDatabase: () => ipcRenderer.invoke("openfolio:localData:revealDatabase"),
    revealBackups: () => ipcRenderer.invoke("openfolio:localData:revealBackups"),
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke("openfolio:mcp:getStatus"),
    start: () => ipcRenderer.invoke("openfolio:mcp:start"),
    stop: () => ipcRenderer.invoke("openfolio:mcp:stop"),
    getSetup: () => ipcRenderer.invoke("openfolio:mcp:getSetup"),
  },
  people: {
    list: (input?: { limit?: number; query?: string }) => ipcRenderer.invoke("openfolio:people:list", input),
    getProfile: (personId: string) => ipcRenderer.invoke("openfolio:people:getProfile", personId),
    updateProfile: (input) => ipcRenderer.invoke("openfolio:people:updateProfile", input),
    addAlias: (input) => ipcRenderer.invoke("openfolio:people:addAlias", input),
    deleteAlias: (input) => ipcRenderer.invoke("openfolio:people:deleteAlias", input),
    searchMessages: (input) => ipcRenderer.invoke("openfolio:people:searchMessages", input),
    addNote: (input: { personId: string; content: string }) => ipcRenderer.invoke("openfolio:people:addNote", input),
    addReminder: (input: { personId: string; title: string; dueAt?: number | null }) => ipcRenderer.invoke("openfolio:people:addReminder", input),
  },
  notes: {
    pin: (noteId: string) => ipcRenderer.invoke("openfolio:notes:pin", noteId),
    unpin: (noteId: string) => ipcRenderer.invoke("openfolio:notes:unpin", noteId),
  },
  reminders: {
    updateStatus: (input) => ipcRenderer.invoke("openfolio:reminders:updateStatus", input),
  },
  threads: {
    list: (input: { limit?: number; offset?: number }) => ipcRenderer.invoke("openfolio:threads:list", input),
    getDetail: (threadId: string) => ipcRenderer.invoke("openfolio:threads:getDetail", threadId),
    getMessages: (input: { threadId: string; limit?: number; offset?: number; aroundMessageId?: string | null; direction?: "older" | "newer" }) => ipcRenderer.invoke("openfolio:threads:getMessages", input),
  },
  sync: {
    getWatcherState: () => ipcRenderer.invoke("openfolio:sync:getWatcherState"),
    startWatcher: () => ipcRenderer.invoke("openfolio:sync:startWatcher"),
    stopWatcher: () => ipcRenderer.invoke("openfolio:sync:stopWatcher"),
    triggerSync: () => ipcRenderer.invoke("openfolio:sync:triggerSync"),
    onSyncComplete: (listener: (job: import("@openfolio/shared-types").MessagesImportJob) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, job: import("@openfolio/shared-types").MessagesImportJob) => listener(job);
      ipcRenderer.on("openfolio:sync:complete", handler);
      return () => ipcRenderer.removeListener("openfolio:sync:complete", handler);
    },
  },
  embeddings: {
    getStatus: () => ipcRenderer.invoke("openfolio:embeddings:getStatus"),
    getSyncStatus: () => ipcRenderer.invoke("openfolio:embeddings:getSyncStatus"),
    syncNow: () => ipcRenderer.invoke("openfolio:embeddings:syncNow"),
  },
  insights: {
    getWrappedSummary: (year?: number) => ipcRenderer.invoke("openfolio:insights:getWrappedSummary", year),
    getTopContacts: (limit?: number) => ipcRenderer.invoke("openfolio:insights:getTopContacts", limit),
    getRelationshipStats: (personId: string) => ipcRenderer.invoke("openfolio:insights:getRelationshipStats", personId),
    getMessageHeatmap: (year?: number) => ipcRenderer.invoke("openfolio:insights:getMessageHeatmap", year),
  },
};

contextBridge.exposeInMainWorld("openfolio", bridge);
