import fs from "node:fs";
import { EventEmitter } from "node:events";
import type { MessagesImportJob } from "@openfolio/shared-types";

export interface SyncWatcherState {
  watching: boolean;
  chatDbPath: string | null;
  lastSyncAt: number | null;
  pendingSync: boolean;
}

/**
 * Watches macOS chat.db for changes via FSEvents (fs.watch)
 * with a polling fallback. Triggers incremental imports
 * after a debounce window.
 */
export class ChatDbWatcher extends EventEmitter {
  private state: SyncWatcherState;
  private fsWatchHandle: ReturnType<typeof fs.watch> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastKnownMtime: number = 0;

  private static readonly DEBOUNCE_MS = 2_000;
  private static readonly POLL_INTERVAL_MS = 30_000;

  constructor(
    private readonly chatDbPath: string,
    private readonly onSync: () => Promise<MessagesImportJob>,
  ) {
    super();
    this.state = {
      watching: false,
      chatDbPath: this.chatDbPath,
      lastSyncAt: null,
      pendingSync: false,
    };
  }

  getState(): SyncWatcherState {
    return { ...this.state };
  }

  start(): SyncWatcherState {
    if (this.state.watching) return this.getState();

    this.state.watching = true;
    this.setupFsWatch();
    this.setupPollFallback();
    this.recordMtime();

    return this.getState();
  }

  stop(): SyncWatcherState {
    this.state.watching = false;

    if (this.fsWatchHandle) {
      this.fsWatchHandle.close();
      this.fsWatchHandle = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    return this.getState();
  }

  private setupFsWatch(): void {
    try {
      this.fsWatchHandle = fs.watch(
        this.chatDbPath,
        { persistent: false },
        (_eventType) => {
          this.scheduleSync();
        },
      );

      this.fsWatchHandle.on("error", (error) => {
        console.warn(
          "[openfolio-watcher] FSEvents error, falling back to polling:",
          error.message,
        );
        this.fsWatchHandle?.close();
        this.fsWatchHandle = null;
      });
    } catch (error) {
      console.warn(
        "[openfolio-watcher] Could not set up FSEvents watcher:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private setupPollFallback(): void {
    this.pollTimer = setInterval(() => {
      if (!this.state.watching) return;

      try {
        const stat = fs.statSync(this.chatDbPath);
        const mtime = stat.mtimeMs;

        if (mtime > this.lastKnownMtime) {
          this.lastKnownMtime = mtime;
          this.scheduleSync();
        }
      } catch {
        // File may be temporarily unavailable during writes
      }
    }, ChatDbWatcher.POLL_INTERVAL_MS);
  }

  private scheduleSync(): void {
    if (this.state.pendingSync) return;

    this.state.pendingSync = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const job = await this.onSync();
        this.state.lastSyncAt = Date.now();
        this.state.pendingSync = false;
        this.recordMtime();
        this.emit("sync", job);
      } catch (error) {
        this.state.pendingSync = false;
        console.error(
          "[openfolio-watcher] Sync failed:",
          error instanceof Error ? error.message : error,
        );
        this.emit("error", error);
      }
    }, ChatDbWatcher.DEBOUNCE_MS);
  }

  private recordMtime(): void {
    try {
      const stat = fs.statSync(this.chatDbPath);
      this.lastKnownMtime = stat.mtimeMs;
    } catch {
      // Ignore — file may not exist yet
    }
  }
}
