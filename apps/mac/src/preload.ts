import { contextBridge, ipcRenderer } from "electron";
import type { OpenFolioBridge } from "@openfolio/shared-types";

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
  },
  contacts: {
    requestAccess: () => ipcRenderer.invoke("openfolio:contacts:requestAccess"),
    getAccessStatus: () => ipcRenderer.invoke("openfolio:contacts:getAccessStatus"),
    sync: () => ipcRenderer.invoke("openfolio:contacts:sync"),
  },
  search: {
    query: (input: { text: string; limit?: number }) => ipcRenderer.invoke("openfolio:search:query", input),
  },
  ai: {
    run: (input: { query: string; useHosted?: boolean }) => ipcRenderer.invoke("openfolio:ai:run", input),
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
  mcp: {
    getStatus: () => ipcRenderer.invoke("openfolio:mcp:getStatus"),
    start: () => ipcRenderer.invoke("openfolio:mcp:start"),
    stop: () => ipcRenderer.invoke("openfolio:mcp:stop"),
  },
  threads: {
    list: (input: { limit?: number; offset?: number }) => ipcRenderer.invoke("openfolio:threads:list", input),
    getDetail: (threadId: string) => ipcRenderer.invoke("openfolio:threads:getDetail", threadId),
    getMessages: (input: { threadId: string; limit?: number; offset?: number }) => ipcRenderer.invoke("openfolio:threads:getMessages", input),
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
  },
  insights: {
    getWrappedSummary: (year?: number) => ipcRenderer.invoke("openfolio:insights:getWrappedSummary", year),
    getTopContacts: (limit?: number) => ipcRenderer.invoke("openfolio:insights:getTopContacts", limit),
    getRelationshipStats: (personId: string) => ipcRenderer.invoke("openfolio:insights:getRelationshipStats", personId),
    getMessageHeatmap: (year?: number) => ipcRenderer.invoke("openfolio:insights:getMessageHeatmap", year),
  },
};

contextBridge.exposeInMainWorld("openfolio", bridge);
