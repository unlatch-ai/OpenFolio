import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import path from "node:path";
import { app } from "electron";
import type { ContactsAccessStatus } from "@openfolio/shared-types";

const execFileAsync = promisify(execFile);
const HELPER_APP_NAME = "OpenFolio Contacts.app";

type HelperPermissionStatus = {
  status: ContactsAccessStatus["status"];
  details: string;
  canPrompt: boolean;
};

type HelperContact = {
  identifier: string;
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  organizationName?: string | null;
  jobTitle?: string | null;
  emails: string[];
  phones: string[];
  avatarDataUrl?: string | null;
};

type HelperExportPayload = {
  contacts: HelperContact[];
};

export type ContactsHelperPathInput = {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
};

export type ContactsHelperPaths = {
  helperAppPath: string;
  executablePath: string;
  launchCwd: string;
};

export function resolveContactsHelperPaths(input: ContactsHelperPathInput): ContactsHelperPaths {
  const relativeAppPath = path.join("bin", HELPER_APP_NAME);
  const basePath = input.isPackaged ? input.resourcesPath : input.appPath;
  const helperAppPath = path.join(basePath, relativeAppPath);

  return {
    helperAppPath,
    executablePath: path.join(helperAppPath, "Contents", "MacOS", "OpenFolioContacts"),
    launchCwd: path.dirname(helperAppPath),
  };
}

function getHelperPaths() {
  return resolveContactsHelperPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
}

function getBuildScriptPath() {
  return path.join(app.getAppPath(), "native", "contacts-bridge.build.sh");
}

async function ensureHelperBinary() {
  const paths = getHelperPaths();
  if (fs.existsSync(paths.helperAppPath)) {
    validateHelperBundle(paths);
    return paths;
  }

  if (app.isPackaged) {
    throw new Error("Packaged Contacts helper app is missing from the app bundle.");
  }

  const buildScriptPath = getBuildScriptPath();
  if (!fs.existsSync(buildScriptPath)) {
    throw new Error("Contacts helper build script is missing.");
  }

  await execFileAsync("bash", [buildScriptPath], {
    cwd: app.getAppPath(),
    maxBuffer: 8 * 1024 * 1024,
  });

  if (!fs.existsSync(paths.helperAppPath)) {
    throw new Error("Contacts helper app did not build successfully.");
  }

  validateHelperBundle(paths);
  return paths;
}

export function validateHelperBundle(paths: ContactsHelperPaths) {
  const appStat = fs.existsSync(paths.helperAppPath) ? fs.statSync(paths.helperAppPath) : null;
  if (!appStat?.isDirectory()) {
    throw new Error(`Contacts helper app is unavailable at ${paths.helperAppPath}.`);
  }

  const executableStat = fs.existsSync(paths.executablePath) ? fs.statSync(paths.executablePath) : null;
  if (!executableStat?.isFile()) {
    throw new Error(`Contacts helper executable is missing at ${paths.executablePath}.`);
  }

  const cwdStat = fs.existsSync(paths.launchCwd) ? fs.statSync(paths.launchCwd) : null;
  if (!cwdStat?.isDirectory()) {
    throw new Error(`Contacts helper launch directory is unavailable at ${paths.launchCwd}.`);
  }
}

async function runHelper<T>(command: "status" | "request" | "export"): Promise<T> {
  const helperPaths = await ensureHelperBinary();
  const outputPath = path.join(os.tmpdir(), `openfolio-contacts-${process.pid}-${Date.now()}.json`);
  let stderr = "";

  try {
    const result = await execFileAsync("open", ["-n", helperPaths.helperAppPath, "--args", command, "--output", outputPath], {
      cwd: helperPaths.launchCwd,
      maxBuffer: 16 * 1024 * 1024,
    });
    stderr = result.stderr;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown launch error.";
    throw new Error(`Could not launch the Contacts helper. ${message}`);
  }

  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }

  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (fs.existsSync(outputPath)) {
        const output = fs.readFileSync(outputPath, "utf8");
        return JSON.parse(output) as T;
      }
      await delay(100);
    }

    throw new Error("Contacts helper did not return a response.");
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

export async function getContactsAccessStatus(): Promise<ContactsAccessStatus> {
  if (process.platform !== "darwin") {
    return {
      status: "unsupported",
      details: "Apple Contacts sync is only available on macOS.",
      canPrompt: false,
    };
  }

  return runHelper<HelperPermissionStatus>("status");
}

export async function requestContactsAccess(): Promise<ContactsAccessStatus> {
  if (process.platform !== "darwin") {
    return getContactsAccessStatus();
  }

  const currentStatus = await getContactsAccessStatus();
  if (currentStatus.status === "denied") {
    return {
      ...currentStatus,
      details: `${currentStatus.details} Open the Contacts privacy pane to enable access for OpenFolio.`,
    };
  }

  if (!currentStatus.canPrompt) {
    return currentStatus;
  }

  try {
    return await runHelper<HelperPermissionStatus>("request");
  } catch (error) {
    const latestStatus = await getContactsAccessStatus().catch(() => null);
    if (latestStatus && latestStatus.status !== "not-determined") {
      return {
        ...latestStatus,
        details: `${latestStatus.details} Open System Settings > Privacy & Security > Contacts and enable OpenFolio, then retry the sync.`,
        canPrompt: false,
      };
    }

    const message = error instanceof Error ? error.message : "Contacts access request failed.";
    return {
      status: "denied",
      details: `${message} Open System Settings > Privacy & Security > Contacts and enable OpenFolio, then retry the sync.`,
      canPrompt: false,
    };
  }
}

export async function exportAppleContacts() {
  if (process.platform !== "darwin") {
    return [];
  }

  const payload = await runHelper<HelperExportPayload>("export");
  return payload.contacts;
}
