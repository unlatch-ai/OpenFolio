import type { LocalDataStatus } from "@openfolio/shared-types";

export function getBackupSummaryLabel(status: LocalDataStatus | null) {
  if (!status) {
    return "Loading local data status...";
  }

  if (status.backupCount === 0) {
    return "No migration backups yet.";
  }

  const backupWord = status.backupCount === 1 ? "backup" : "backups";
  return `${status.backupCount} migration ${backupWord}. Latest: ${status.latestBackupName ?? "unknown"}`;
}

export function getPathLabel(path: string | null | undefined) {
  return path || "Unavailable";
}
