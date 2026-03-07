import { app, dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import electronUpdater from "electron-updater";
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import type { UpdateState } from "@openfolio/shared-types";
import { createInitialUpdateState, formatUpdateError, isAutoUpdateSupported, isMissingPublishedReleaseError } from "./updater-state";

const { autoUpdater } = electronUpdater;

type UpdaterWindowGetter = () => BrowserWindow | null;
type UpdaterLogger = (...args: unknown[]) => void;

export class OpenFolioUpdater {
  private state = createInitialUpdateState(app.getVersion());
  private initialized = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly getWindow: UpdaterWindowGetter,
    private readonly log: UpdaterLogger = () => {},
  ) {}

  getState() {
    return this.state;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!isAutoUpdateSupported(app.isPackaged)) {
      this.setState({
        status: "unsupported",
        message: "Auto-update is available in signed release builds downloaded from GitHub Releases.",
      });
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
      this.log("checking-for-update");
      this.setState({
        status: "checking",
        message: "Checking GitHub Releases for a newer build.",
        progress: null,
      });
    });

    autoUpdater.on("update-available", (info) => {
      this.onUpdateAvailable(info);
    });

    autoUpdater.on("update-not-available", () => {
      this.log("update-not-available");
      this.setState({
        status: "not-available",
        checkedAt: Date.now(),
        availableVersion: null,
        downloadedVersion: null,
        progress: null,
        message: "You are on the latest version of OpenFolio.",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.onDownloadProgress(progress);
    });

    autoUpdater.on("update-downloaded", (event) => {
      void this.onUpdateDownloaded(event);
    });

    autoUpdater.on("error", (error) => {
      this.handleError(error);
    });

    setTimeout(() => {
      void this.checkNow();
    }, 12_000);

    this.interval = setInterval(() => {
      void this.checkNow();
    }, 6 * 60 * 60 * 1000);
    this.interval.unref();
  }

  async checkNow() {
    this.log("checkNow");
    if (!isAutoUpdateSupported(app.isPackaged)) {
      this.setState({
        status: "unsupported",
        message: "Auto-update is available in signed release builds downloaded from GitHub Releases.",
      });
      return this.state;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.handleError(error);
    }
    return this.state;
  }

  installNow() {
    this.log("installNow", this.state.status);
    if (this.state.status !== "downloaded") {
      return;
    }

    autoUpdater.quitAndInstall();
  }

  dispose() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private setState(next: Partial<UpdateState>) {
    this.state = {
      ...this.state,
      ...next,
      currentVersion: app.getVersion(),
    };

    const window = this.getWindow();
    this.log("state", this.state);
    if (window && !window.isDestroyed()) {
      window.webContents.send("openfolio:updates:state", this.state);
    }
  }

  private onUpdateAvailable(info: UpdateInfo) {
    this.log("update-available", info.version);
    this.setState({
      status: "available",
      checkedAt: Date.now(),
      availableVersion: info.version,
      downloadedVersion: null,
      progress: 0,
      message: `Version ${info.version} is downloading in the background.`,
    });
  }

  private onDownloadProgress(progress: ProgressInfo) {
    this.log("download-progress", progress.percent);
    this.setState({
      status: "downloading",
      checkedAt: Date.now(),
      progress: progress.percent,
      message: `Downloading OpenFolio ${this.state.availableVersion ?? "update"} (${Math.round(progress.percent)}%).`,
    });
  }

  private async onUpdateDownloaded(event: UpdateDownloadedEvent) {
    this.log("update-downloaded", event.version);
    this.setState({
      status: "downloaded",
      checkedAt: Date.now(),
      downloadedVersion: event.version,
      progress: 100,
      message: `OpenFolio ${event.version} is ready to install.`,
    });

    const window = this.getWindow();
    const options: MessageBoxOptions = {
      type: "info",
      buttons: ["Cancel", "Update"],
      defaultId: 1,
      cancelId: 0,
      title: "Update Ready",
      message: `A new version of OpenFolio is available.`,
      detail: `OpenFolio ${event.version} has finished downloading. Choose Update to quit and install it now.`,
    };
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);

    if (result.response === 1) {
      this.installNow();
    }
  }

  private handleError(error: unknown) {
    this.log("error", error);
    if (isMissingPublishedReleaseError(error)) {
      this.setState({
        status: "not-available",
        checkedAt: Date.now(),
        availableVersion: null,
        downloadedVersion: null,
        progress: null,
        message: "You are on the latest version of OpenFolio.",
      });
      return;
    }

    this.setState({
      status: "error",
      checkedAt: Date.now(),
      message: formatUpdateError(error),
    });
  }
}

export type { AppUpdater };
