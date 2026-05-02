import { describe, expect, it } from "vitest";
import { getOnboardingState } from "../src/renderer/onboarding";

describe("onboarding state", () => {
  it("starts with Messages permission as the active required step", () => {
    const state = getOnboardingState({
      messagesStatus: {
        status: "denied",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Full Disk Access required.",
      },
      contactsStatus: {
        status: "not-determined",
        details: "Contacts access has not been requested.",
        canPrompt: true,
      },
      threadCount: 0,
      importJob: null,
      contactsSync: null,
      embeddingSync: null,
      setupDismissed: false,
    });

    expect(state.shouldShow).toBe(true);
    expect(state.activeStepId).toBe("messages");
    expect(state.canEnterApp).toBe(false);
    expect(state.steps.map((step) => [step.id, step.status])).toEqual([
      ["messages", "active"],
      ["import", "blocked"],
      ["contacts", "waiting"],
      ["embeddings", "waiting"],
    ]);
  });

  it("allows entry after messages have been imported while contacts and embeddings continue", () => {
    const state = getOnboardingState({
      messagesStatus: {
        status: "granted",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Messages access granted.",
      },
      contactsStatus: {
        status: "not-determined",
        details: "Contacts access has not been requested.",
        canPrompt: true,
      },
      threadCount: 12,
      importJob: {
        id: "job_1",
        status: "completed",
        importedMessages: 1200,
        importedPeople: 40,
        importedThreads: 12,
        lastCursor: 1200,
        error: null,
        startedAt: 1,
        completedAt: 2,
      },
      contactsSync: null,
      embeddingSync: {
        totalDocuments: 300,
        embeddedDocuments: 140,
        dirtyDocuments: 160,
        provider: "local",
        model: "all-MiniLM-L6-v2",
        syncing: true,
        lastError: null,
      },
      setupDismissed: false,
    });

    expect(state.shouldShow).toBe(true);
    expect(state.activeStepId).toBe("contacts");
    expect(state.canEnterApp).toBe(true);
    expect(state.progress.completedRequired).toBe(2);
    expect(state.progress.totalRequired).toBe(2);
  });

  it("stays hidden once the user enters the app after required setup is done", () => {
    const state = getOnboardingState({
      messagesStatus: {
        status: "granted",
        chatDbPath: "/Users/me/Library/Messages/chat.db",
        details: "Messages access granted.",
      },
      contactsStatus: {
        status: "granted",
        details: "Contacts access granted.",
        canPrompt: false,
      },
      threadCount: 3,
      importJob: null,
      contactsSync: { importedContacts: 20, peopleImported: 20, interactionsImported: 0 },
      embeddingSync: {
        totalDocuments: 40,
        embeddedDocuments: 40,
        dirtyDocuments: 0,
        provider: "local",
        model: "all-MiniLM-L6-v2",
        syncing: false,
        lastError: null,
      },
      setupDismissed: true,
    });

    expect(state.shouldShow).toBe(false);
    expect(state.canEnterApp).toBe(true);
  });
});
