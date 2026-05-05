import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalDataStatus } from "../src/local-data";
import { getBackupSummaryLabel, getPathLabel } from "../src/renderer/local-data-labels";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-local-data-"));
}

describe("local data status", () => {
  it("reports no migration backups before a backups folder exists", () => {
    const dbPath = path.join(tempDir(), "openfolio.sqlite");
    fs.writeFileSync(dbPath, "");

    const status = getLocalDataStatus(dbPath);

    expect(status.databasePath).toBe(dbPath);
    expect(status.backupDirectoryPath).toBe(path.join(path.dirname(dbPath), "backups"));
    expect(status.backupCount).toBe(0);
    expect(status.latestBackupName).toBeNull();
    expect(getBackupSummaryLabel(status)).toBe("No migration backups yet.");
  });

  it("counts logical migration backups and picks the newest primary backup", () => {
    const dir = tempDir();
    const dbPath = path.join(dir, "openfolio.sqlite");
    const backupDir = path.join(dir, "backups");
    fs.mkdirSync(backupDir);
    fs.writeFileSync(dbPath, "");

    const older = "openfolio.sqlite.before-schema-1-to-3.2026-05-01T00-00-00-000Z";
    const newer = "openfolio.sqlite.before-schema-2-to-3.2026-05-02T00-00-00-000Z";
    fs.writeFileSync(path.join(backupDir, older), "");
    fs.writeFileSync(path.join(backupDir, newer), "");
    fs.writeFileSync(path.join(backupDir, `${newer}-wal`), "");
    fs.utimesSync(path.join(backupDir, older), new Date("2026-05-01T00:00:00Z"), new Date("2026-05-01T00:00:00Z"));
    fs.utimesSync(path.join(backupDir, newer), new Date("2026-05-02T00:00:00Z"), new Date("2026-05-02T00:00:00Z"));

    const status = getLocalDataStatus(dbPath);

    expect(status.backupCount).toBe(2);
    expect(status.latestBackupName).toBe(newer);
    expect(getBackupSummaryLabel(status)).toContain(`Latest: ${newer}`);
    expect(getPathLabel(status.databasePath)).toBe(dbPath);
  });
});
