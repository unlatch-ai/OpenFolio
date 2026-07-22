import fs from "node:fs";
import { app, BrowserWindow, ipcMain, nativeImage, session, shell } from "electron";
import os from "node:os";
import path from "node:path";
import { installNodeNetworkLock, OpenFolioCore } from "@openfolio/core";
import type {
  ContactsSyncSummary,
  ContactsAccessStatus,
  DiagnosticsReport,
  EditablePersonProfile,
  EmbeddingPriority,
  LocalDataStatus,
  McpSetupStatus,
  MessagesAccessStatus,
  MessagesImportJob,
  OpenFolioBridge,
  PersonAlias,
  Reminder,
  SearchQueryInput,
  SearchResponse,
  ConversationCitationInput,
  UpdateState,
} from "@openfolio/shared-types";
import { LocalMcpController } from "@openfolio/mcp";
import { exportAppleContacts, getContactsAccessStatus, requestContactsAccess } from "./contacts";
import { withContactsAccessGuidance } from "./contacts-guidance";
import {
  getMessagesAccessTarget as resolveMessagesAccessTarget,
  withMessagesAccessGuidance,
} from "./messages-access";
import {
  createRuntimeNetworkPolicy,
  isIpcSenderAllowed,
  isNavigationAllowed,
  isRuntimeRequestAllowed,
  isSafeSystemSettingsUrl,
  type RuntimeNetworkPolicy,
} from "./navigation";
import { getBackupDirectoryPath, getLocalDataStatus } from "./local-data";
import { EmbeddingWorkerClient } from "./embedding-worker-client";
import { VectorIndexWorkerClient } from "./vector-index-worker-client";

installNodeNetworkLock();
const embeddingWorker = new EmbeddingWorkerClient(
  path.join(process.resourcesPath, "models"),
  path.join(__dirname, "embedding-worker.js"),
);
const vectorIndexWorker = new VectorIndexWorkerClient(
  path.join(__dirname, "vector-index-worker.js"),
);
const core = new OpenFolioCore({
  embeddingEngine: embeddingWorker,
  networkPolicy: "offline",
  vectorIndexSync: (dbPath) => app.whenReady().then(() => vectorIndexWorker.sync(dbPath)),
});
const mcpController = new LocalMcpController();
const MANUAL_UPDATE_MESSAGE = "OpenFolio does not connect to the Internet or check for updates. Download the newest version independently and replace OpenFolio.app. Your private library remains in Application Support on this Mac.";

let mainWindow: BrowserWindow | null = null;
let messagesImportPromise: Promise<MessagesImportJob> | null = null;
const debugLogging = process.env.OPENFOLIO_DEBUG === "1" || process.env.OPENFOLIO_DEBUG_LOGS === "1";
const enforceSingleInstance = !process.defaultApp;
const shouldOpenDevTools = process.env.OPENFOLIO_OPEN_DEVTOOLS === "1";
let runtimeNetworkPolicy: RuntimeNetworkPolicy | null = null;

function logAppDebug(scope: string, ...args: unknown[]) {
  if (debugLogging) {
    console.log(`[openfolio-${scope}]`, ...args);
  }
}

function createManualUpdateState(): UpdateState {
  return {
    status: "unsupported",
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    progress: null,
    message: MANUAL_UPDATE_MESSAGE,
    checkedAt: null,
  };
}

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function setDockIcon() {
  if (process.platform !== "darwin" || app.isPackaged) {
    return;
  }

  const iconPath = path.join(app.getAppPath(), "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }
}

function getMessagesAccessTarget() {
  return resolveMessagesAccessTarget({
    appExecutablePath: app.getPath("exe"),
    processExecPath: process.execPath,
    pathExists: fs.existsSync,
  });
}

function revealMessagesAccessTargetInFinder() {
  const target = getMessagesAccessTarget();
  if (!fs.existsSync(target.revealPath)) {
    return false;
  }

  shell.showItemInFolder(target.revealPath);
  return true;
}

async function openMessagesFullDiskAccessSettings() {
  const settingsUrl = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
  if (!isSafeSystemSettingsUrl(settingsUrl)) {
    return false;
  }
  try {
    await shell.openExternal(settingsUrl);
    return true;
  } catch (error) {
    console.warn("[openfolio] Failed to open Full Disk Access settings:", error);
    return false;
  }
}

function getGuidedMessagesAccessStatus(
  status: MessagesAccessStatus,
  options?: {
    openedSettings?: boolean;
    revealedInFinder?: boolean;
  },
) {
  return withMessagesAccessGuidance(status, {
    target: getMessagesAccessTarget(),
    appIsPackaged: app.isPackaged,
    processExecPath: process.execPath,
    openedSettings: options?.openedSettings,
    revealedInFinder: options?.revealedInFinder,
  });
}

function startMessagesImportInBackground() {
  const active = core.getActiveMessagesImport();
  if (active) {
    return active;
  }

  messagesImportPromise = core.startMessagesImport()
    .then((job) => {
      mainWindow?.webContents.send("openfolio:sync:complete", job);
      return job;
    })
    .finally(() => {
      messagesImportPromise = null;
    });

  return core.getActiveMessagesImport();
}

if (enforceSingleInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else if (enforceSingleInstance) {
  app.on("second-instance", () => {
    focusWindow();
  });
}

function installRuntimeNetworkPolicy(policy: RuntimeNetworkPolicy) {
  const appSession = session.defaultSession;
  appSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    callback({ cancel: !isRuntimeRequestAllowed(details.url, policy) });
  });
  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  appSession.on("will-download", (event) => event.preventDefault());
}

function createWindow() {
  const browserWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
    },
  });
  mainWindow = browserWindow;

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    browserWindow.loadURL(rendererUrl.toString());
  } else {
    browserWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (shouldOpenDevTools) {
    browserWindow.webContents.openDevTools({ mode: "detach" });
  }

  browserWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  browserWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());

  browserWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = browserWindow.webContents.getURL();
    if (!runtimeNetworkPolicy || !isNavigationAllowed(url, currentUrl, runtimeNetworkPolicy)) {
      event.preventDefault();
    }
  });

  browserWindow.on("closed", () => {
    if (mainWindow === browserWindow) {
      mainWindow = null;
    }
  });
}

app.whenReady().then(() => {
  runtimeNetworkPolicy = createRuntimeNetworkPolicy(app.isPackaged, process.env.ELECTRON_RENDERER_URL);
  installRuntimeNetworkPolicy(runtimeNetworkPolicy);
  setDockIcon();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const api: OpenFolioBridge = {
  dashboard: {
    getThreadSummaries: async (limit?: number) => {
      logAppDebug("dashboard", "getThreadSummaries", { limit });
      return core.getThreadSummaries(limit);
    },
    getReminderSuggestions: async (limit?: number) => {
      logAppDebug("dashboard", "getReminderSuggestions", { limit });
      return core.getReminderSuggestions(limit);
    },
  },
  messages: {
    requestAccess: async () => {
      logAppDebug("messages", "requestAccess");
      const access = core.getMessagesAccessStatus();
      if (access.status !== "denied") {
        const status = getGuidedMessagesAccessStatus(access);
        logAppDebug("messages", "requestAccessResult", status);
        return status;
      }

      // The app added to Full Disk Access must be the process that reads
      // chat.db. A separate setup helper is the wrong TCC identity even when
      // it visually represents OpenFolio, so reveal the exact target bundle
      // and let the user add that bundle in System Settings.
      const openedSettings = await openMessagesFullDiskAccessSettings();
      const revealedInFinder = revealMessagesAccessTargetInFinder();
      const status = getGuidedMessagesAccessStatus(access, { openedSettings, revealedInFinder });
      logAppDebug("messages", "requestAccessResult", status);
      return status;
    },
    getAccessStatus: async () => {
      const status = getGuidedMessagesAccessStatus(core.getMessagesAccessStatus());
      logAppDebug("messages", "getAccessStatus", status);
      return status;
    },
    openSettings: async () => {
      const openedSettings = await openMessagesFullDiskAccessSettings();
      const revealedInFinder = revealMessagesAccessTargetInFinder();
      const status = getGuidedMessagesAccessStatus(core.getMessagesAccessStatus(), { openedSettings, revealedInFinder });
      logAppDebug("messages", "openSettings", status);
      return status;
    },
    startImport: async () => {
      logAppDebug("messages", "startImport");
      const job = startMessagesImportInBackground() ?? await (messagesImportPromise ?? core.startMessagesImport());
      logAppDebug("messages", "startImportResult", job);
      return job;
    },
    getImportStatus: async (jobId: string) => {
      const job = core.getMessagesImportStatus(jobId);
      logAppDebug("messages", "getImportStatus", jobId, job);
      return job;
    },
    getActiveImport: async () => {
      const job = core.getActiveMessagesImport();
      logAppDebug("messages", "getActiveImport", job);
      return job;
    },
    cancelImport: async (jobId: string) => {
      const job = core.cancelMessagesImport(jobId);
      logAppDebug("messages", "cancelImport", jobId, job);
      return job;
    },
    retryImport: async (jobId?: string | null) => {
      logAppDebug("messages", "retryImport", jobId);
      const job = await core.retryMessagesImport(jobId);
      logAppDebug("messages", "retryImportResult", job);
      return job;
    },
  },
  contacts: {
    requestAccess: async () => {
      logAppDebug("contacts", "requestAccess");
      const status = await requestContactsAccess();
      if (status.status === "denied") {
        const settingsUrl = "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts";
        if (isSafeSystemSettingsUrl(settingsUrl)) {
          await shell.openExternal(settingsUrl);
        }
      }
      const guided = withContactsAccessGuidance(status);
      logAppDebug("contacts", "requestAccessResult", guided);
      return guided;
    },
    getAccessStatus: async () => {
      const status = withContactsAccessGuidance(await getContactsAccessStatus());
      logAppDebug("contacts", "getAccessStatus", status);
      return status;
    },
    sync: async (): Promise<ContactsSyncSummary> => {
      logAppDebug("contacts", "sync");
      const access = withContactsAccessGuidance(await getContactsAccessStatus());
      if (access.status !== "granted") {
        throw new Error(access.details);
      }

      const contacts = await exportAppleContacts();
      const summary = core.applyConnectorSync({
        people: contacts.map((contact) => {
          const handles = [...contact.emails, ...contact.phones].filter(Boolean);
          return {
            displayName: contact.displayName,
            primaryHandle: handles[0] ?? null,
            email: contact.emails[0] ?? null,
            phone: contact.phones[0] ?? null,
            companyName: contact.organizationName ?? null,
            jobTitle: contact.jobTitle ?? null,
            sourceKind: "apple_contacts" as const,
            sourceId: contact.identifier,
            metadata: {
              handles,
              givenName: contact.givenName ?? null,
              familyName: contact.familyName ?? null,
            },
          };
        }),
        interactions: [],
        cursor: null,
        hasMore: false,
      });

      const result = {
        importedContacts: contacts.length,
        peopleImported: summary.peopleImported,
        interactionsImported: summary.interactionsImported,
      };
      logAppDebug("contacts", "syncResult", result);
      return result;
    },
  },
  search: {
    query: async ({ text, limit }: { text: string; limit?: number }) => core.search(text, limit),
    queryArchive: async (input: SearchQueryInput): Promise<SearchResponse> => {
      logAppDebug("search", "query", input);
      const response = await core.searchArchive(input);
      logAppDebug("search", "resultCount", response.resultCount, response.semanticStatus);
      return response;
    },
    getCitationContext: async (input: ConversationCitationInput) => core.getConversationCitationContext(
      input.threadId,
      input.messageId,
      input.before,
      input.after,
    ),
    getScaleStatus: async () => core.getSearchScaleStatus(),
  },
  updates: {
    getState: async () => createManualUpdateState(),
    checkNow: async () => createManualUpdateState(),
    installNow: async () => {
      throw new Error(MANUAL_UPDATE_MESSAGE);
    },
    onStateChange: () => () => {},
  },
  localData: {
    getStatus: async (): Promise<LocalDataStatus> => getLocalDataStatus(core.db.dbPath),
    revealDatabase: async () => {
      shell.showItemInFolder(core.db.dbPath);
    },
    revealBackups: async () => {
      const backupDirectoryPath = getBackupDirectoryPath(core.db.dbPath);
      fs.mkdirSync(backupDirectoryPath, { recursive: true });
      shell.showItemInFolder(backupDirectoryPath);
    },
  },
  diagnostics: {
    getReport: async (): Promise<DiagnosticsReport> => {
      const messagesStatus = core.getMessagesAccessStatus();
      const contactsStatus = withContactsAccessGuidance(await getContactsAccessStatus());
      const activeImport = core.getActiveMessagesImport();
      return {
        generatedAt: Date.now(),
        appVersion: app.getVersion(),
        platform: process.platform,
        osRelease: os.release(),
        arch: process.arch,
        electronVersion: process.versions.electron ?? "unknown",
        nodeVersion: process.versions.node,
        messagesStatus: {
          status: messagesStatus.status,
          requiresFullDiskAccess: messagesStatus.requiresFullDiskAccess,
          chatDbPath: messagesStatus.chatDbPath,
        },
        contactsStatus: {
          status: contactsStatus.status,
        },
        updateState: createManualUpdateState(),
        localData: getLocalDataStatus(core.db.dbPath),
        watcherState: core.getWatcherState(),
        activeImport: activeImport
          ? {
              status: activeImport.status,
              importedMessages: activeImport.importedMessages,
              importedPeople: activeImport.importedPeople,
              importedThreads: activeImport.importedThreads,
              lastCursor: activeImport.lastCursor,
              startedAt: activeImport.startedAt,
              completedAt: activeImport.completedAt,
            }
          : null,
        embeddingSync: core.getEmbeddingSyncStatus(),
        mcpStatus: await mcpController.getStatus(),
      };
    },
  },
  mcp: {
    getStatus: async () => {
      const status = await mcpController.getStatus();
      logAppDebug("mcp", "getStatus", status);
      return status;
    },
    start: async () => {
      logAppDebug("mcp", "start");
      const status = await mcpController.start();
      logAppDebug("mcp", "startResult", status);
      return status;
    },
    stop: async () => {
      logAppDebug("mcp", "stop");
      const status = await mcpController.stop();
      logAppDebug("mcp", "stopResult", status);
      return status;
    },
    getSetup: async (): Promise<McpSetupStatus> => {
      const command = "pnpm --filter @openfolio/mcp exec openfolio mcp serve";
      return {
        available: true,
        command,
        details: "OpenFolio MCP itself runs offline over local stdio. Tool results can contain private library data, and the configured client may send those results to its own service.",
        clients: [
          {
            id: "claude",
            name: "Claude Desktop",
            config: JSON.stringify({ mcpServers: { openfolio: { command: "pnpm", args: ["--filter", "@openfolio/mcp", "exec", "openfolio", "mcp", "serve"] } } }, null, 2),
          },
          {
            id: "cursor",
            name: "Cursor",
            config: JSON.stringify({ mcpServers: { openfolio: { command: "pnpm", args: ["--filter", "@openfolio/mcp", "exec", "openfolio", "mcp", "serve"] } } }, null, 2),
          },
          {
            id: "codex",
            name: "Codex",
            config: "Use the local command as a stdio MCP server:\n" + command,
          },
          {
            id: "chatgpt",
            name: "ChatGPT",
            config: "Use OpenFolio's local MCP server through a local connector that supports stdio:\n" + command,
          },
        ],
      };
    },
  },
  people: {
    list: async (input?: { limit?: number; query?: string }) => core.listPeople(input?.limit, input?.query),
    getProfile: async (personId: string) => core.getPersonProfile(personId),
    updateProfile: async (input: { personId: string; profile: EditablePersonProfile }) => core.updatePersonProfile(input.personId, input.profile),
    addAlias: async (input: { personId: string; value: string; kind?: PersonAlias["kind"] }) => core.addPersonAlias(input.personId, input.value, input.kind),
    deleteAlias: async (input: { aliasId: string }) => core.deletePersonAlias(input.aliasId),
    searchMessages: async (input: { personId: string; query?: string; limit?: number; offset?: number }) => core.searchPersonMessages(input.personId, input.query, input.limit, input.offset),
    addNote: async (input: { personId: string; content: string }) => core.addNote("person", input.personId, input.content),
    addReminder: async (input: { personId: string; title: string; dueAt?: number | null }) => core.addReminder(input.title, input.personId, input.dueAt ?? null),
  },
  notes: {
    pin: async (noteId: string) => core.pinNote(noteId),
    unpin: async (noteId: string) => core.unpinNote(noteId),
  },
  reminders: {
    updateStatus: async (input: { reminderId: string; status: Reminder["status"] }) => core.updateReminderStatus(input.reminderId, input.status),
  },
  threads: {
    list: async (input: { limit?: number; offset?: number }) => {
      logAppDebug("threads", "list", input);
      return core.listThreadsPaginated(input.limit, input.offset);
    },
    getDetail: async (threadId: string) => {
      logAppDebug("threads", "getDetail", threadId);
      return core.getThreadDetail(threadId);
    },
    getMessages: async (input: { threadId: string; limit?: number; offset?: number; aroundMessageId?: string | null; direction?: "older" | "newer" }) => {
      logAppDebug("threads", "getMessages", input);
      return core.getThreadMessages(input.threadId, input.limit, input.offset, input.aroundMessageId, input.direction);
    },
  },
  sync: {
    getWatcherState: async () => {
      return core.getWatcherState();
    },
    startWatcher: async () => {
      logAppDebug("sync", "startWatcher");
      const state = core.startWatcher();
      // Push sync events to renderer
      core.onWatcherSync((job) => {
        mainWindow?.webContents.send("openfolio:sync:complete", job);
      });
      return state;
    },
    stopWatcher: async () => {
      logAppDebug("sync", "stopWatcher");
      return core.stopWatcher();
    },
    triggerSync: async () => {
      logAppDebug("sync", "triggerSync");
      return core.startMessagesImport();
    },
    onSyncComplete: () => () => {},
  },
  embeddings: {
    getStatus: async () => {
      return core.getLocalEmbeddingStatus();
    },
    getSyncStatus: async () => {
      const status = core.getEmbeddingSyncStatus();
      logAppDebug("embeddings", "getSyncStatus", status);
      return status;
    },
    getPlan: async () => core.getEmbeddingPlanStats(),
    setPriority: async (priority: EmbeddingPriority) => core.setEmbeddingPriority(priority),
    syncNow: async () => {
      logAppDebug("embeddings", "syncNow");
      void core.queueEmbeddingSync()
        .then((result) => logAppDebug("embeddings", "syncResult", result))
        .catch((error) => {
          console.error("[openfolio-core] Background embedding sync failed:", error);
        });
      return core.getEmbeddingSyncStatus();
    },
  },
  insights: {
    getWrappedSummary: async (year?: number) => {
      return core.analytics.getWrappedSummary(year);
    },
    getTopContacts: async (limit?: number) => {
      return core.analytics.getTopContacts(limit);
    },
    getRelationshipStats: async (personId: string) => {
      return core.analytics.getRelationshipStats(personId);
    },
    getMessageHeatmap: async (year?: number) => {
      return core.analytics.getMessageHeatmap(year);
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeHandle(channel: string, handler: (...args: any[]) => unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.handle(channel, async (event, ...args: any[]) => {
    try {
      const senderFrame = event.senderFrame;
      if (
        !runtimeNetworkPolicy
        || !mainWindow
        || mainWindow.isDestroyed()
        || event.sender !== mainWindow.webContents
        || !senderFrame
        || senderFrame !== event.sender.mainFrame
        || !isIpcSenderAllowed(senderFrame.url, runtimeNetworkPolicy)
      ) {
        throw new Error("Rejected IPC from an untrusted renderer frame.");
      }
      return await handler(event, ...args);
    } catch (error) {
      console.error(`[openfolio-ipc] ${channel} failed:`, error);
      throw new Error(`${channel}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });
}

safeHandle("openfolio:dashboard:getThreadSummaries", (_, limit?: number) => api.dashboard.getThreadSummaries(limit));
safeHandle("openfolio:dashboard:getReminderSuggestions", (_, limit?: number) => api.dashboard.getReminderSuggestions(limit));
safeHandle("openfolio:messages:requestAccess", () => api.messages.requestAccess());
safeHandle("openfolio:messages:getAccessStatus", () => api.messages.getAccessStatus());
safeHandle("openfolio:messages:openSettings", () => api.messages.openSettings());
safeHandle("openfolio:messages:startImport", () => api.messages.startImport());
safeHandle("openfolio:messages:getImportStatus", (_, jobId: string) => api.messages.getImportStatus(jobId));
safeHandle("openfolio:messages:getActiveImport", () => api.messages.getActiveImport());
safeHandle("openfolio:messages:cancelImport", (_, jobId: string) => api.messages.cancelImport(jobId));
safeHandle("openfolio:messages:retryImport", (_, jobId?: string | null) => api.messages.retryImport(jobId));
safeHandle("openfolio:contacts:requestAccess", () => api.contacts.requestAccess());
safeHandle("openfolio:contacts:getAccessStatus", () => api.contacts.getAccessStatus());
safeHandle("openfolio:contacts:sync", () => api.contacts.sync());
safeHandle("openfolio:search:query", (_, input: { text: string; limit?: number }) => api.search.query(input));
safeHandle("openfolio:search:queryArchive", (_, input: SearchQueryInput) => api.search.queryArchive(input));
safeHandle("openfolio:search:getCitationContext", (_, input: ConversationCitationInput) => api.search.getCitationContext(input));
safeHandle("openfolio:search:getScaleStatus", () => api.search.getScaleStatus());
safeHandle("openfolio:updates:getState", () => api.updates.getState());
safeHandle("openfolio:localData:getStatus", () => api.localData.getStatus());
safeHandle("openfolio:localData:revealDatabase", () => api.localData.revealDatabase());
safeHandle("openfolio:localData:revealBackups", () => api.localData.revealBackups());
safeHandle("openfolio:diagnostics:getReport", () => api.diagnostics.getReport());
safeHandle("openfolio:mcp:getStatus", () => api.mcp.getStatus());
safeHandle("openfolio:mcp:start", () => api.mcp.start());
safeHandle("openfolio:mcp:stop", () => api.mcp.stop());
safeHandle("openfolio:mcp:getSetup", () => api.mcp.getSetup());
safeHandle("openfolio:people:list", (_, input?: { limit?: number; query?: string }) => api.people.list(input));
safeHandle("openfolio:people:getProfile", (_, personId: string) => api.people.getProfile(personId));
safeHandle("openfolio:people:updateProfile", (_, input: { personId: string; profile: EditablePersonProfile }) => api.people.updateProfile(input));
safeHandle("openfolio:people:addAlias", (_, input: { personId: string; value: string; kind?: PersonAlias["kind"] }) => api.people.addAlias(input));
safeHandle("openfolio:people:deleteAlias", (_, input: { aliasId: string }) => api.people.deleteAlias(input));
safeHandle("openfolio:people:searchMessages", (_, input: { personId: string; query?: string; limit?: number; offset?: number }) => api.people.searchMessages(input));
safeHandle("openfolio:people:addNote", (_, input: { personId: string; content: string }) => api.people.addNote(input));
safeHandle("openfolio:people:addReminder", (_, input: { personId: string; title: string; dueAt?: number | null }) => api.people.addReminder(input));
safeHandle("openfolio:notes:pin", (_, noteId: string) => api.notes.pin(noteId));
safeHandle("openfolio:notes:unpin", (_, noteId: string) => api.notes.unpin(noteId));
safeHandle("openfolio:reminders:updateStatus", (_, input: { reminderId: string; status: Reminder["status"] }) => api.reminders.updateStatus(input));
safeHandle("openfolio:threads:list", (_, input: { limit?: number; offset?: number }) => api.threads.list(input));
safeHandle("openfolio:threads:getDetail", (_, threadId: string) => api.threads.getDetail(threadId));
safeHandle("openfolio:threads:getMessages", (_, input: { threadId: string; limit?: number; offset?: number; aroundMessageId?: string | null; direction?: "older" | "newer" }) => api.threads.getMessages(input));
safeHandle("openfolio:sync:getWatcherState", () => api.sync.getWatcherState());
safeHandle("openfolio:sync:startWatcher", () => api.sync.startWatcher());
safeHandle("openfolio:sync:stopWatcher", () => api.sync.stopWatcher());
safeHandle("openfolio:sync:triggerSync", () => api.sync.triggerSync());
safeHandle("openfolio:embeddings:getStatus", () => api.embeddings.getStatus());
safeHandle("openfolio:embeddings:getSyncStatus", () => api.embeddings.getSyncStatus());
safeHandle("openfolio:embeddings:getPlan", () => api.embeddings.getPlan());
safeHandle("openfolio:embeddings:setPriority", (_event, priority: EmbeddingPriority) => api.embeddings.setPriority(priority));
safeHandle("openfolio:embeddings:syncNow", () => api.embeddings.syncNow());
safeHandle("openfolio:insights:getWrappedSummary", (_, year?: number) => api.insights.getWrappedSummary(year));
safeHandle("openfolio:insights:getTopContacts", (_, limit?: number) => api.insights.getTopContacts(limit));
safeHandle("openfolio:insights:getRelationshipStats", (_, personId: string) => api.insights.getRelationshipStats(personId));
safeHandle("openfolio:insights:getMessageHeatmap", (_, year?: number) => api.insights.getMessageHeatmap(year));
