import { describe, expect, it } from "vitest";
import type { DiagnosticsReport, MessageDetail, Note, Reminder, SearchResult, SearchScaleStatus } from "@openfolio/shared-types";
import { formatDiagnosticsReport } from "../src/renderer/diagnostics";
import { getImportPrimaryAction, isImportTerminal } from "../src/renderer/import-jobs";
import {
  filterPersonMessages,
  formatAliasLabel,
  getReminderStatusLabel,
  getReminderToggleLabel,
  orderProfileNotes,
} from "../src/renderer/people-profile";
import { describeSearchScale, formatCitationMeta, groupSearchResults } from "../src/renderer/search-results";
import { getAppVersionLabel, getLastCheckedLabel, getReleaseNotesUrl, getUpdateStatusLabel, getUpdateVersionLabel } from "../src/renderer/update-labels";

describe("renderer workflow helpers", () => {
  it("chooses import retry and cancel actions from concrete job state", () => {
    expect(getImportPrimaryAction(null, false)).toEqual({ kind: "blocked", label: "Grant access" });
    expect(getImportPrimaryAction(null, true)).toEqual({ kind: "start", label: "Import messages" });
    expect(getImportPrimaryAction({
      id: "job_1",
      status: "running",
      importedMessages: 1,
      importedPeople: 1,
      importedThreads: 1,
      lastCursor: 1,
      error: null,
      startedAt: 1,
      completedAt: null,
    }, true)).toEqual({ kind: "cancel", label: "Cancel import" });
    expect(getImportPrimaryAction({
      id: "job_2",
      status: "failed",
      importedMessages: 0,
      importedPeople: 0,
      importedThreads: 0,
      lastCursor: null,
      error: "no access",
      startedAt: 1,
      completedAt: 2,
    }, true)).toEqual({ kind: "retry", label: "Retry import" });
  });

  it("identifies terminal import statuses", () => {
    expect(isImportTerminal(null)).toBe(false);
    expect(isImportTerminal({
      id: "job_1",
      status: "cancelled",
      importedMessages: 1,
      importedPeople: 1,
      importedThreads: 1,
      lastCursor: 1,
      error: null,
      startedAt: 1,
      completedAt: 2,
    })).toBe(true);
  });

  it("groups command palette results by result kind", () => {
    const results = [
      { id: "1", kind: "message", entityId: "m1", title: "Ada", snippet: "hello", score: 1 },
      { id: "2", kind: "person", entityId: "p1", title: "Ada", snippet: "person", score: 1 },
      { id: "3", kind: "message", entityId: "m2", title: "Bob", snippet: "yo", score: 1 },
    ] satisfies SearchResult[];

    expect(Object.keys(groupSearchResults(results))).toEqual(["message", "person"]);
    expect(groupSearchResults(results).message).toHaveLength(2);
  });

  it("filters person messages case-insensitively without matching attachments", () => {
    const messages = [
      { id: "1", threadId: "t", personId: "p", body: "Met at the salon", occurredAt: 1, isFromMe: false, hasAttachments: false, attachments: [] },
      { id: "2", threadId: "t", personId: "p", body: null, occurredAt: 2, isFromMe: false, hasAttachments: true, attachments: [] },
    ] satisfies MessageDetail[];

    expect(filterPersonMessages(messages, "SALON")).toEqual([messages[0]]);
    expect(filterPersonMessages(messages, "")).toEqual(messages);
  });

  it("describes when search scale needs benchmarking", () => {
    const status = {
      totalDocuments: 60_000,
      embeddedDocuments: 60_000,
      dirtyDocuments: 0,
      vectorScanWarningThreshold: 50_000,
      recommendVectorIndex: true,
      estimatedVectorBytes: 92_160_000,
    } satisfies SearchScaleStatus;

    expect(describeSearchScale(status)).toContain("Run the local benchmark");
  });

  it("orders pinned notes before unpinned notes", () => {
    const notes = [
      { id: "old", entityType: "person", entityId: "p", content: "old", pinned: false, pinnedAt: null, createdAt: 10 },
      { id: "pin", entityType: "person", entityId: "p", content: "pin", pinned: true, pinnedAt: 5, createdAt: 5 },
      { id: "new", entityType: "person", entityId: "p", content: "new", pinned: false, pinnedAt: null, createdAt: 20 },
    ] satisfies Note[];

    expect(orderProfileNotes(notes).map((note) => note.id)).toEqual(["pin", "new", "old"]);
  });

  it("formats alias and reminder labels for profile controls", () => {
    const reminder = { status: "open" } satisfies Pick<Reminder, "status">;

    expect(formatAliasLabel({ value: "Ada L.", kind: "name" })).toBe("Name: Ada L.");
    expect(getReminderStatusLabel(reminder)).toBe("Open");
    expect(getReminderToggleLabel(reminder)).toBe("Done");
  });

  it("formats evidence citation metadata", () => {
    const result = {
      id: "doc",
      kind: "message",
      entityId: "m",
      title: "Message",
      snippet: "hello",
      score: 1,
      sourceLabel: "Ada",
      occurredAt: new Date("2026-05-01T12:00:00Z").getTime(),
    } satisfies SearchResult;

    expect(formatCitationMeta(result)).toContain("Ada");
    expect(formatCitationMeta(result)).toContain("2026");
  });

  it("formats updater state for Settings without leaking raw status values", () => {
    expect(getUpdateStatusLabel(null)).toBe("Not checked");
    const upToDate = {
      status: "not-available",
      currentVersion: "0.3.1",
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      message: "You are on the latest version of OpenFolio.",
      checkedAt: 1,
    } as const;

    expect(getUpdateStatusLabel(upToDate)).toBe("Up to date");
    expect(getUpdateVersionLabel(upToDate)).toBe("Installed: 0.3.1");
    expect(getLastCheckedLabel(upToDate)).toMatch(/Last checked:/);
    expect(getReleaseNotesUrl(upToDate)).toBe("https://github.com/unlatch-ai/OpenFolio/releases/tag/v0.3.1");
    expect(getUpdateVersionLabel({ ...upToDate, availableVersion: "0.3.2" })).toBe("Available: 0.3.2");
    expect(getUpdateVersionLabel({ ...upToDate, downloadedVersion: "0.3.3" })).toBe("Downloaded: 0.3.3");
    expect(getAppVersionLabel({
      status: "idle",
      currentVersion: "0.3.1",
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      message: null,
      checkedAt: null,
    })).toBe("OpenFolio 0.3.1");
  });

  it("formats diagnostics without private message, contact, key, or token fields", () => {
    const report = {
      generatedAt: Date.UTC(2026, 4, 5),
      appVersion: "0.3.3",
      platform: "darwin",
      osRelease: "25.3.0",
      arch: "arm64",
      electronVersion: "39.8.1",
      nodeVersion: "22.0.0",
      messagesStatus: { status: "granted", requiresFullDiskAccess: false, chatDbPath: "/Users/me/Library/Messages/chat.db" },
      contactsStatus: { status: "granted" },
      updateState: {
        status: "not-available",
        currentVersion: "0.3.3",
        availableVersion: null,
        downloadedVersion: null,
        progress: null,
        message: "secret message text should not appear",
        checkedAt: Date.UTC(2026, 4, 5),
      },
      localData: {
        databasePath: "/Users/me/Library/Application Support/OpenFolio/openfolio.sqlite",
        backupDirectoryPath: "/Users/me/Library/Application Support/OpenFolio/backups",
        backupCount: 1,
        latestBackupName: "openfolio.sqlite.before-schema-2-to-3.backup",
      },
      watcherState: { watching: true, chatDbPath: "/Users/me/Library/Messages/chat.db", lastSyncAt: null, pendingSync: false },
      activeImport: { status: "completed", importedMessages: 10, importedPeople: 2, importedThreads: 3, lastCursor: 10, startedAt: 1, completedAt: 2 },
      embeddingSync: { totalDocuments: 10, embeddedDocuments: 9, dirtyDocuments: 1, provider: "local", model: "test", syncing: false, lastError: null },
      mcpStatus: { running: false, mode: "stdio", available: true, command: "secret-token-command", details: "ok" },
    } satisfies DiagnosticsReport;

    const text = formatDiagnosticsReport(report);

    expect(text).toContain("App version: 0.3.3");
    expect(text).toContain("Messages: granted");
    expect(text).toContain("Backup count: 1");
    expect(text).not.toContain("secret message text");
    expect(text).not.toContain("secret-token-command");
    expect(text).not.toContain("OpenAI");
    expect(text).not.toContain("token");
  });
});
