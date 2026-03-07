import { contextBridge, ipcRenderer } from "electron";
import type { OpenFolioBridge } from "@openfolio/shared-types";

const bridge: OpenFolioBridge = {
  db: {
    query: (sql: string) => ipcRenderer.invoke("openfolio:db:query", sql),
    mutate: (sql: string) => ipcRenderer.invoke("openfolio:db:mutate", sql),
  },
  messages: {
    requestAccess: () => ipcRenderer.invoke("openfolio:messages:requestAccess"),
    getAccessStatus: () => ipcRenderer.invoke("openfolio:messages:getAccessStatus"),
    startImport: () => ipcRenderer.invoke("openfolio:messages:startImport"),
    getImportStatus: (jobId: string) => ipcRenderer.invoke("openfolio:messages:getImportStatus", jobId),
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
};

contextBridge.exposeInMainWorld("openfolio", bridge);
