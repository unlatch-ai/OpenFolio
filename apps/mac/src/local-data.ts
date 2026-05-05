import fs from "node:fs";
import path from "node:path";
import type { LocalDataStatus } from "@openfolio/shared-types";

export function getBackupDirectoryPath(databasePath: string) {
  return path.join(path.dirname(databasePath), "backups");
}

export function listMigrationBackups(databasePath: string) {
  const backupDirectoryPath = getBackupDirectoryPath(databasePath);
  if (!fs.existsSync(backupDirectoryPath)) {
    return [];
  }

  const databaseName = path.basename(databasePath);
  return fs
    .readdirSync(backupDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${databaseName}.before-schema-`) && !name.endsWith("-wal") && !name.endsWith("-shm"))
    .map((name) => {
      const fullPath = path.join(backupDirectoryPath, name);
      return { name, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function getLocalDataStatus(databasePath: string): LocalDataStatus {
  const backups = listMigrationBackups(databasePath);
  return {
    databasePath,
    backupDirectoryPath: getBackupDirectoryPath(databasePath),
    backupCount: backups.length,
    latestBackupName: backups[0]?.name ?? null,
  };
}
