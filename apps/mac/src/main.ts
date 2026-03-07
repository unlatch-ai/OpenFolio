import fs from "node:fs";
import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, shell } from "electron";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { OpenFolioCore } from "@openfolio/core";
import type {
  ConnectorAccount,
  ConnectorCredential,
  ContactsSyncSummary,
  CloudRuntimeConfig,
  ContactsAccessStatus,
  MessagesAccessStatus,
  OpenFolioBridge,
  SearchResult,
} from "@openfolio/shared-types";
import { LocalMcpController } from "@openfolio/mcp";
import { exportAppleContacts, getContactsAccessStatus, requestContactsAccess } from "./contacts";
import { OpenFolioUpdater } from "./updater";
import { shouldOpenExternalUrl } from "./navigation";

const core = new OpenFolioCore();
const mcpController = new LocalMcpController();
const updater = new OpenFolioUpdater(() => mainWindow, (...args) => {
  logAppDebug("updates", ...args);
});
const cloudConfig: CloudRuntimeConfig = {
  convexUrl: process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || null,
  hostedBaseUrl: process.env.SITE_URL || process.env.OPENFOLIO_SITE_URL || "http://localhost:3000",
  deviceName: os.hostname(),
  platform: process.platform,
};

let mainWindow: BrowserWindow | null = null;
let pendingAuthCallbackUrl: string | null = null;
let authCallbackServer: Server | null = null;
const debugLogging = process.env.OPENFOLIO_DEBUG === "1" || process.env.OPENFOLIO_DEBUG_LOGS === "1";
const debugAuthFlow = process.env.OPENFOLIO_DEBUG_AUTH === "1";
const enforceSingleInstance = !process.defaultApp;
const shouldOpenDevTools = process.env.OPENFOLIO_OPEN_DEVTOOLS === "1";
const CONNECTOR_ACCOUNTS_KEY = "connector_accounts";
const CONNECTOR_CREDENTIAL_PREFIX = "connector_credential:";

function logAuthDebug(...args: unknown[]) {
  if (debugAuthFlow || debugLogging) {
    console.log("[openfolio-auth]", ...args);
  }
}

function logAppDebug(scope: string, ...args: unknown[]) {
  if (debugLogging) {
    console.log(`[openfolio-${scope}]`, ...args);
  }
}

function readConnectorAccounts(): ConnectorAccount[] {
  const raw = core.db.getSetting(CONNECTOR_ACCOUNTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ConnectorAccount[] : [];
  } catch (error) {
    console.error("[openfolio] Failed to parse connector accounts:", error);
    return [];
  }
}

function writeConnectorAccounts(accounts: ConnectorAccount[]) {
  core.db.setSetting(CONNECTOR_ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function listConnectorAccounts() {
  return readConnectorAccounts();
}

async function saveConnectorCredential(input: ConnectorCredential) {
  const accounts = readConnectorAccounts();
  const nextAccount: ConnectorAccount = {
    provider: input.provider,
    accountId: input.accountId,
    label: input.label,
    scopes: input.scopes,
    createdAt: accounts.find((account) => account.provider === input.provider && account.accountId === input.accountId)?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  const rawValue = JSON.stringify({
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    expiresAt: input.expiresAt ?? null,
    scopes: input.scopes,
    label: input.label,
  });
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[openfolio] Keychain encryption unavailable — credentials will be stored in plaintext.");
  }
  const storedValue = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(rawValue).toString("base64")
    : rawValue;
  core.db.setSetting(`${CONNECTOR_CREDENTIAL_PREFIX}${input.provider}:${input.accountId}`, storedValue);

  const remaining = accounts.filter((account) => !(account.provider === input.provider && account.accountId === input.accountId));
  remaining.push(nextAccount);
  writeConnectorAccounts(remaining.sort((left, right) => left.label.localeCompare(right.label)));
  return nextAccount;
}

async function deleteConnectorCredential(input: { provider: ConnectorCredential["provider"]; accountId: string }) {
  core.db.setSetting(`${CONNECTOR_CREDENTIAL_PREFIX}${input.provider}:${input.accountId}`, "");
  const remaining = readConnectorAccounts().filter((account) => !(account.provider === input.provider && account.accountId === input.accountId));
  writeConnectorAccounts(remaining);
  return { ok: true };
}

function withContactsAccessGuidance(status: ContactsAccessStatus): ContactsAccessStatus {
  if (status.status !== "denied") {
    return status;
  }

  return {
    ...status,
    details: `${status.details} Open System Settings > Privacy & Security > Contacts and enable OpenFolio, then retry the sync.`,
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

function isValidAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "openfolio:" && parsed.pathname === "//auth/callback";
  } catch {
    return false;
  }
}

function dispatchAuthCallback(url: string) {
  logAuthDebug("dispatchAuthCallback", url);

  if (!isValidAuthCallbackUrl(url)) {
    logAuthDebug("rejected invalid auth callback URL", url);
    return;
  }

  pendingAuthCallbackUrl = url;
  focusWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    logAuthDebug("sending auth callback to renderer");
    mainWindow.webContents.send("openfolio:cloud:authCallback", url);
    pendingAuthCallbackUrl = null;
  }
}

function findAppBundlePath(executablePath: string) {
  let currentPath = executablePath;

  for (let attempts = 0; attempts < 8; attempts += 1) {
    if (currentPath.endsWith(".app")) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  return null;
}

function getMessagesAccessTarget() {
  const packagedAppBundlePath = findAppBundlePath(app.getPath("exe"));
  if (packagedAppBundlePath && fs.existsSync(packagedAppBundlePath)) {
    return {
      label: path.basename(packagedAppBundlePath),
      revealPath: packagedAppBundlePath,
    };
  }

  return {
    label: path.basename(process.execPath),
    revealPath: process.execPath,
  };
}

function withMessagesAccessGuidance(
  status: MessagesAccessStatus,
  options?: {
    revealedInFinder?: boolean;
  },
): MessagesAccessStatus {
  if (status.status !== "denied") {
    return status;
  }

  const target = getMessagesAccessTarget();
  let details = `${status.details} macOS does not show a native Full Disk Access prompt for this database. Open System Settings > Privacy & Security > Full Disk Access, click +, add ${target.label}, and relaunch OpenFolio.`;

  if (options?.revealedInFinder) {
    details += ` ${target.label} has been revealed in Finder so you can pick it from the + dialog.`;
  }

  if (!app.isPackaged) {
    details += ` In development, grant Full Disk Access to Electron at ${process.execPath}. If access is still denied, also grant Full Disk Access to your terminal app and relaunch both.`;
  }

  return {
    ...status,
    details,
  };
}

function revealMessagesAccessTargetInFinder() {
  const target = getMessagesAccessTarget();
  if (!fs.existsSync(target.revealPath)) {
    return false;
  }

  shell.showItemInFolder(target.revealPath);
  return true;
}

async function stopAuthCallbackServer() {
  if (!authCallbackServer) {
    return;
  }

  const server = authCallbackServer;
  authCallbackServer = null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function beginAuthSession() {
  await stopAuthCallbackServer();

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/auth/callback") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const callbackUrl = new URL("openfolio://auth/callback");
    for (const [key, value] of requestUrl.searchParams.entries()) {
      callbackUrl.searchParams.set(key, value);
    }

    logAuthDebug("loopback callback received", callbackUrl.toString());
    dispatchAuthCallback(callbackUrl.toString());

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>OpenFolio</title></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111827;color:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <main style="max-width:560px;padding:32px;">
      <h1 style="font-size:28px;margin:0 0 12px;">Signed in to OpenFolio</h1>
      <p style="color:#d1d5db;line-height:1.5;">You can close this browser tab and return to the app.</p>
    </main>
  </body>
</html>`);

    setTimeout(() => {
      void stopAuthCallbackServer().catch((error) => {
        logAuthDebug("failed to stop auth callback server", error);
      });
    }, 250);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  authCallbackServer = server;
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("OpenFolio could not start the local auth callback server.");
  }

  const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
  logAuthDebug("beginAuthSession", redirectUri);
  return { redirectUri };
}

if (enforceSingleInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else if (enforceSingleInstance) {
  app.on("second-instance", (_event, argv) => {
    logAuthDebug("second-instance argv", argv);
    const callbackUrl = argv.find((value) => value.startsWith("openfolio://"));
    if (callbackUrl) {
      dispatchAuthCallback(callbackUrl);
    }
  });
}

if (process.defaultApp && process.argv[1]) {
  const registered = app.setAsDefaultProtocolClient("openfolio", process.execPath, [path.resolve(process.argv[1])]);
  logAuthDebug("setAsDefaultProtocolClient defaultApp", registered, process.execPath, path.resolve(process.argv[1]));
} else {
  const registered = app.setAsDefaultProtocolClient("openfolio");
  logAuthDebug("setAsDefaultProtocolClient packaged", registered);
}
app.on("open-url", (event, url) => {
  event.preventDefault();
  logAuthDebug("open-url", url);
  dispatchAuthCallback(url);
});

function createWindow() {
  const browserWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.mjs"),
      sandbox: true,
    },
  });
  mainWindow = browserWindow;

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    if (debugAuthFlow) {
      rendererUrl.searchParams.set("debugAuth", "1");
    }
    browserWindow.loadURL(rendererUrl.toString());
  } else {
    browserWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (shouldOpenDevTools) {
    browserWindow.webContents.openDevTools({ mode: "detach" });
  }

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  browserWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = browserWindow.webContents.getURL();
    if (shouldOpenExternalUrl(url, currentUrl)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  browserWindow.webContents.on("did-finish-load", () => {
    logAuthDebug("did-finish-load", browserWindow.webContents.getURL(), pendingAuthCallbackUrl);
    if (pendingAuthCallbackUrl) {
      browserWindow.webContents.send("openfolio:cloud:authCallback", pendingAuthCallbackUrl);
      pendingAuthCallbackUrl = null;
    }

    if (debugAuthFlow) {
      void browserWindow.webContents.executeJavaScript(
        "console.log('[openfolio-auth-renderer] beginAuthSession type', typeof window.openfolio?.cloud?.beginAuthSession)",
      );
    }
  });

  if (debugAuthFlow) {
    browserWindow.webContents.on("console-message", (_event, level, message) => {
      console.log("[openfolio-renderer-console]", level, message);
    });
  }

  browserWindow.on("closed", () => {
    if (mainWindow === browserWindow) {
      mainWindow = null;
    }
  });
}

app.whenReady().then(() => {
  setDockIcon();
  createWindow();
  updater.initialize();

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

app.on("before-quit", () => {
  updater.dispose();
  void stopAuthCallbackServer().catch((error) => {
    console.warn("[openfolio] Auth callback server cleanup failed:", error);
  });
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
      await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
      const revealedInFinder = revealMessagesAccessTargetInFinder();
      const status = withMessagesAccessGuidance(core.getMessagesAccessStatus(), { revealedInFinder });
      logAppDebug("messages", "requestAccessResult", status);
      return status;
    },
    getAccessStatus: async () => {
      const status = withMessagesAccessGuidance(core.getMessagesAccessStatus());
      logAppDebug("messages", "getAccessStatus", status);
      return status;
    },
    startImport: async () => {
      logAppDebug("messages", "startImport");
      const job = await core.startMessagesImport();
      logAppDebug("messages", "startImportResult", job);
      return job;
    },
    getImportStatus: async (jobId: string) => {
      const job = core.getMessagesImportStatus(jobId);
      logAppDebug("messages", "getImportStatus", jobId, job);
      return job;
    },
  },
  contacts: {
    requestAccess: async () => {
      logAppDebug("contacts", "requestAccess");
      const status = await requestContactsAccess();
      if (status.status === "denied") {
        await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts");
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
    query: async ({ text, limit }: { text: string; limit?: number }): Promise<SearchResult[]> => {
      logAppDebug("search", "query", { text, limit });
      const results = await core.search(text, limit);
      logAppDebug("search", "resultCount", results.length);
      return results;
    },
  },
  ai: {
    run: async ({ query }: { query: string; useHosted?: boolean }) => {
      logAppDebug("ai", "run", { query });
      const result = await core.ask(query);
      logAppDebug("ai", "result", { provider: result.provider, citations: result.citations.length });
      return result;
    },
  },
  cloud: {
    getConfig: async () => cloudConfig,
    beginAuthSession: async () => beginAuthSession(),
    openExternal: async (url: string) => {
      logAppDebug("cloud", "openExternal", url);
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "127.0.0.1")) {
        throw new Error(`Refusing to open URL with disallowed scheme: ${parsed.protocol}`);
      }
      await shell.openExternal(url);
    },
    onAuthCallback: () => () => {},
  },
  connectorCredentials: {
    listAccounts: async () => {
      const accounts = await listConnectorAccounts();
      logAppDebug("connectors", "listAccounts", accounts.length);
      return accounts;
    },
    saveCredential: async (input: ConnectorCredential) => {
      logAppDebug("connectors", "saveCredential", input.provider, input.accountId);
      return saveConnectorCredential(input);
    },
    deleteCredential: async (input: { provider: ConnectorCredential["provider"]; accountId: string }) => {
      logAppDebug("connectors", "deleteCredential", input.provider, input.accountId);
      return deleteConnectorCredential(input);
    },
  },
  updates: {
    getState: async () => {
      const state = updater.getState();
      logAppDebug("updates", "getState", state);
      return state;
    },
    checkNow: async () => {
      logAppDebug("updates", "checkNow");
      return updater.checkNow();
    },
    installNow: async () => {
      logAppDebug("updates", "installNow");
      updater.installNow();
    },
    onStateChange: () => () => {},
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
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeHandle(channel: string, handler: (...args: any[]) => unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.handle(channel, async (...args: any[]) => {
    try {
      return await handler(...args);
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
safeHandle("openfolio:messages:startImport", () => api.messages.startImport());
safeHandle("openfolio:messages:getImportStatus", (_, jobId: string) => api.messages.getImportStatus(jobId));
safeHandle("openfolio:contacts:requestAccess", () => api.contacts.requestAccess());
safeHandle("openfolio:contacts:getAccessStatus", () => api.contacts.getAccessStatus());
safeHandle("openfolio:contacts:sync", () => api.contacts.sync());
safeHandle("openfolio:search:query", (_, input: { text: string; limit?: number }) => api.search.query(input));
safeHandle("openfolio:ai:run", (_, input: { query: string; useHosted?: boolean }) => api.ai.run(input));
safeHandle("openfolio:cloud:getConfig", () => api.cloud.getConfig());
safeHandle("openfolio:cloud:beginAuthSession", () => api.cloud.beginAuthSession());
safeHandle("openfolio:cloud:openExternal", (_, url: string) => api.cloud.openExternal(url));
safeHandle("openfolio:connectors:listAccounts", () => api.connectorCredentials.listAccounts());
safeHandle("openfolio:connectors:saveCredential", (_, input: ConnectorCredential) => api.connectorCredentials.saveCredential(input));
safeHandle("openfolio:connectors:deleteCredential", (_, input: { provider: ConnectorCredential["provider"]; accountId: string }) => api.connectorCredentials.deleteCredential(input));
safeHandle("openfolio:updates:getState", () => api.updates.getState());
safeHandle("openfolio:updates:checkNow", () => api.updates.checkNow());
safeHandle("openfolio:updates:installNow", () => api.updates.installNow());
safeHandle("openfolio:mcp:getStatus", () => api.mcp.getStatus());
safeHandle("openfolio:mcp:start", () => api.mcp.start());
safeHandle("openfolio:mcp:stop", () => api.mcp.stop());
