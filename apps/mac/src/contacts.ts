import { execFile } from "node:child_process";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { app } from "electron";
import type { ContactsAccessStatus } from "@openfolio/shared-types";

const execFileAsync = promisify(execFile);
const HELPER_BINARY_NAME = "openfolio-contacts-bridge";

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
};

type HelperExportPayload = {
  contacts: HelperContact[];
};

function getBinaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", HELPER_BINARY_NAME);
  }

  return path.join(app.getAppPath(), "bin", HELPER_BINARY_NAME);
}

function getSourcePath() {
  return path.join(app.getAppPath(), "native", "contacts-bridge.swift");
}

async function ensureHelperBinary() {
  const binaryPath = getBinaryPath();
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  if (app.isPackaged) {
    throw new Error("Packaged Contacts helper is missing from the app bundle.");
  }

  const sourcePath = getSourcePath();
  if (!fs.existsSync(sourcePath)) {
    throw new Error("Contacts helper source file is missing.");
  }

  await mkdir(path.dirname(binaryPath), { recursive: true });
  await execFileAsync("swiftc", [sourcePath, "-framework", "Contacts", "-o", binaryPath], {
    cwd: app.getAppPath(),
    maxBuffer: 8 * 1024 * 1024,
  });

  return binaryPath;
}

async function runHelper<T>(command: "status" | "request" | "export"): Promise<T> {
  const binaryPath = await ensureHelperBinary();
  const { stdout, stderr } = await execFileAsync(binaryPath, [command], {
    cwd: app.getAppPath(),
    maxBuffer: 16 * 1024 * 1024,
  });

  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }

  return JSON.parse(stdout) as T;
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

  return runHelper<HelperPermissionStatus>("request");
}

export async function exportAppleContacts() {
  if (process.platform !== "darwin") {
    return [];
  }

  const payload = await runHelper<HelperExportPayload>("export");
  return payload.contacts;
}
