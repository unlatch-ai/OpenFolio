import fs from "node:fs";
import path from "node:path";
import type { MessagesAccessStatus } from "@openfolio/shared-types";

export type MessagesAccessTarget = {
  label: string;
  revealPath: string;
};

export function findAppBundlePath(executablePath: string) {
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

export function getMessagesAccessTarget(input: {
  appExecutablePath: string;
  processExecPath?: string;
  pathExists?: (targetPath: string) => boolean;
}): MessagesAccessTarget {
  const exists = input.pathExists ?? fs.existsSync;
  const fallbackPath = input.processExecPath ?? input.appExecutablePath;
  const packagedAppBundlePath = findAppBundlePath(input.appExecutablePath);
  if (packagedAppBundlePath && exists(packagedAppBundlePath)) {
    return {
      label: path.basename(packagedAppBundlePath),
      revealPath: packagedAppBundlePath,
    };
  }

  return {
    label: path.basename(fallbackPath),
    revealPath: fallbackPath,
  };
}

export function withMessagesAccessGuidance(
  status: MessagesAccessStatus,
  input: {
    target: MessagesAccessTarget;
    appIsPackaged: boolean;
    processExecPath: string;
    openedSettings?: boolean;
    revealedInFinder?: boolean;
  },
): MessagesAccessStatus {
  if (status.status !== "denied") {
    return {
      ...status,
      accessTargetLabel: input.target.label,
      requiresFullDiskAccess: false,
      openedFullDiskAccessSettings: Boolean(input.openedSettings),
      revealedInFinder: Boolean(input.revealedInFinder),
    };
  }

  let details = `${status.details} Open System Settings > Privacy & Security > Full Disk Access and enable ${input.target.label}.`;

  if (input.openedSettings) {
    details += " OpenFolio opened that settings pane for you.";
  }

  if (input.revealedInFinder) {
    details += ` ${input.target.label} has been revealed in Finder in case you need to add it manually from the + button.`;
  }

  details += " Relaunch OpenFolio after enabling access, then retry the import.";

  if (!input.appIsPackaged) {
    details += ` In development, grant Full Disk Access to Electron at ${input.processExecPath}. If access is still denied, also grant Full Disk Access to your terminal app and relaunch both.`;
  }

  return {
    ...status,
    details,
    accessTargetLabel: input.target.label,
    requiresFullDiskAccess: true,
    openedFullDiskAccessSettings: Boolean(input.openedSettings),
    revealedInFinder: Boolean(input.revealedInFinder),
  };
}
