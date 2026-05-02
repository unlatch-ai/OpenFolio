import { describe, expect, it } from "vitest";
import type { MessageDetail, SearchResult, SearchScaleStatus } from "@openfolio/shared-types";
import { getImportPrimaryAction, isImportTerminal } from "../src/renderer/import-jobs";
import { filterPersonMessages } from "../src/renderer/people-profile";
import { describeSearchScale, groupSearchResults } from "../src/renderer/search-results";

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
      { id: "1", threadId: "t", personId: "p", body: "Met at the salon", occurredAt: 1, isFromMe: false, hasAttachments: false },
      { id: "2", threadId: "t", personId: "p", body: null, occurredAt: 2, isFromMe: false, hasAttachments: true },
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
});
