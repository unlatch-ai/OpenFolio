import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { OpenFolioCore } from "@openfolio/core";
import type {
  CloudRuntimeConfig,
  MessagesAccessStatus,
  OpenFolioBridge,
  SearchResult,
} from "@openfolio/shared-types";
import { LocalMcpController } from "@openfolio/mcp";
import { OpenFolioUpdater } from "./updater";
import { shouldOpenExternalUrl } from "./navigation";

const core = new OpenFolioCore();
const mcpController = new LocalMcpController();
const updater = new OpenFolioUpdater(() => mainWindow, (...args) => {
  logAppDebug("updates", ...args);
});
const cloudConfig: CloudRuntimeConfig = {
  convexUrl: process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "https://blessed-pig-525.convex.cloud",
  hostedBaseUrl: process.env.SITE_URL || process.env.OPENFOLIO_SITE_URL || "http://localhost:3000",
  deviceName: os.hostname(),
  platform: process.platform,
};

let mainWindow: BrowserWindow | null = null;
let pendingAuthCallbackUrl: string | null = null;
let authCallbackServer: Server | null = null;
const debugAuthFlow = process.env.OPENFOLIO_DEBUG_AUTH === "1" || !app.isPackaged;
const enforceSingleInstance = !process.defaultApp;

function logAuthDebug(...args: unknown[]) {
  if (debugAuthFlow) {
    console.log("[openfolio-auth]", ...args);
  }
}

function logAppDebug(scope: string, ...args: unknown[]) {
  if (debugAuthFlow) {
    console.log(`[openfolio-${scope}]`, ...args);
  }
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

function dispatchAuthCallback(url: string) {
  logAuthDebug("dispatchAuthCallback", url);
  pendingAuthCallbackUrl = url;
  focusWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    logAuthDebug("sending auth callback to renderer");
    mainWindow.webContents.send("openfolio:cloud:authCallback", url);
    pendingAuthCallbackUrl = null;
  }
}

function withDevMessagesHint(status: MessagesAccessStatus): MessagesAccessStatus {
  if (app.isPackaged || status.status !== "denied") {
    return status;
  }

  return {
    ...status,
    details: `${status.details} In development, grant Full Disk Access to Electron at ${process.execPath}. If access is still denied, also grant Full Disk Access to your terminal app and relaunch both.`,
  };
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
      sandbox: false,
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

  if (debugAuthFlow) {
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
  void stopAuthCallbackServer().catch(() => {});
});

const api: OpenFolioBridge = {
  db: {
    query: async (sql: string) => {
      logAppDebug("db", "query", sql);
      const result = core.db.rawQuery(sql);
      logAppDebug("db", "queryRows", result.length);
      return result;
    },
    mutate: async (sql: string) => {
      logAppDebug("db", "mutate", sql);
      const result = core.db.rawMutate(sql);
      logAppDebug("db", "mutateResult", result);
      return result;
    },
  },
  messages: {
    requestAccess: async () => {
      logAppDebug("messages", "requestAccess");
      await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
      const status = withDevMessagesHint(core.getMessagesAccessStatus());
      logAppDebug("messages", "requestAccessResult", status);
      return status;
    },
    getAccessStatus: async () => {
      const status = withDevMessagesHint(core.getMessagesAccessStatus());
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
      await shell.openExternal(url);
    },
    onAuthCallback: () => () => {},
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

ipcMain.handle("openfolio:db:query", (_, sql: string) => api.db.query(sql));
ipcMain.handle("openfolio:db:mutate", (_, sql: string) => api.db.mutate(sql));
ipcMain.handle("openfolio:messages:requestAccess", async (): Promise<MessagesAccessStatus> => api.messages.requestAccess());
ipcMain.handle("openfolio:messages:getAccessStatus", () => api.messages.getAccessStatus());
ipcMain.handle("openfolio:messages:startImport", () => api.messages.startImport());
ipcMain.handle("openfolio:messages:getImportStatus", (_, jobId: string) => api.messages.getImportStatus(jobId));
ipcMain.handle("openfolio:search:query", (_, input: { text: string; limit?: number }) => api.search.query(input));
ipcMain.handle("openfolio:ai:run", (_, input: { query: string; useHosted?: boolean }) => api.ai.run(input));
ipcMain.handle("openfolio:cloud:getConfig", () => api.cloud.getConfig());
ipcMain.handle("openfolio:cloud:beginAuthSession", () => api.cloud.beginAuthSession());
ipcMain.handle("openfolio:cloud:openExternal", (_, url: string) => api.cloud.openExternal(url));
ipcMain.handle("openfolio:updates:getState", () => api.updates.getState());
ipcMain.handle("openfolio:updates:checkNow", () => api.updates.checkNow());
ipcMain.handle("openfolio:updates:installNow", () => api.updates.installNow());
ipcMain.handle("openfolio:mcp:getStatus", () => api.mcp.getStatus());
ipcMain.handle("openfolio:mcp:start", () => api.mcp.start());
ipcMain.handle("openfolio:mcp:stop", () => api.mcp.stop());
