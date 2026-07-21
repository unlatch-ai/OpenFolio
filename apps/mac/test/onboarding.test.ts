import { describe, expect, it } from "vitest";
import type { MessagesImportJob } from "@openfolio/shared-types";
import { getOnboardingState } from "../src/renderer/onboarding";

const baseInput = {
  setupDismissed: false,
};

function completedImport(overrides: Partial<MessagesImportJob> = {}): MessagesImportJob {
  return {
    id: "job_1",
    status: "completed",
    importedMessages: 1200,
    importedPeople: 40,
    importedThreads: 12,
    lastCursor: 1200,
    error: null,
    startedAt: 1,
    completedAt: 2,
    ...overrides,
  };
}

describe("onboarding state", () => {
  it("requires Messages access before indexing", () => {
    const state = getOnboardingState({
      ...baseInput,
      messagesStatus: {
        status: "denied",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Full Disk Access required.",
      },
      threadCount: 0,
      importJob: null,
    });

    expect(state).toMatchObject({
      shouldShow: true,
      canEnterApp: false,
      stage: "messages",
      messagesGranted: false,
      imported: false,
    });
  });

  it("moves to local indexing after Messages access is granted", () => {
    const state = getOnboardingState({
      ...baseInput,
      messagesStatus: {
        status: "granted",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Messages access granted.",
      },
      threadCount: 0,
      importJob: null,
    });

    expect(state.stage).toBe("import");
    expect(state.canEnterApp).toBe(false);
  });

  it("shows the ready step after a completed import, including an empty one", () => {
    const state = getOnboardingState({
      ...baseInput,
      messagesStatus: {
        status: "granted",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Messages access granted.",
      },
      threadCount: 0,
      importJob: completedImport({ importedMessages: 0, importedThreads: 0, lastCursor: null }),
    });

    expect(state.stage).toBe("ready");
    expect(state.canEnterApp).toBe(true);
    expect(state.shouldShow).toBe(true);
  });

  it("enters the app only after required setup is complete and dismissed", () => {
    const state = getOnboardingState({
      ...baseInput,
      setupDismissed: true,
      messagesStatus: {
        status: "granted",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Messages access granted.",
      },
      threadCount: 12,
      importJob: completedImport(),
    });

    expect(state.stage).toBe("ready");
    expect(state.canEnterApp).toBe(true);
    expect(state.shouldShow).toBe(false);
  });
});
