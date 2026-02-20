import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTask = vi.fn((params: unknown) => params);

const mockConnectorSync = vi.fn();
const mockGetConnector = vi.fn(() => ({ sync: mockConnectorSync }));

const mockProcessSync = vi.fn();
const mockDecrypt = vi.fn((value: string) => `dec:${value}`);

const mockIntegrationsSelectSingle = vi.fn();
const mockSyncLogsInsertSingle = vi.fn();
const mockIntegrationsUpdate = vi.fn().mockReturnThis();
const mockIntegrationsUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSyncLogsUpdate = vi.fn().mockReturnThis();
const mockSyncLogsUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });

const integrationsSelectBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: mockIntegrationsSelectSingle,
};

const integrationsUpdateBuilder = {
  update: mockIntegrationsUpdate,
  eq: mockIntegrationsUpdateEq,
};

const syncLogsInsertBuilder = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: mockSyncLogsInsertSingle,
};

const syncLogsUpdateBuilder = {
  update: mockSyncLogsUpdate,
  eq: mockSyncLogsUpdateEq,
};

let integrationsFromCount = 0;
let syncLogsFromCount = 0;

const mockFrom = vi.fn((table: string) => {
  if (table === "integrations") {
    integrationsFromCount++;
    return integrationsFromCount === 1
      ? integrationsSelectBuilder
      : integrationsUpdateBuilder;
  }

  if (table === "sync_logs") {
    syncLogsFromCount++;
    return syncLogsFromCount === 1
      ? syncLogsInsertBuilder
      : syncLogsUpdateBuilder;
  }

  return integrationsUpdateBuilder;
});

vi.mock("@trigger.dev/sdk", () => ({ task: mockTask }));

vi.mock("@/lib/integrations/registry", () => ({
  getConnector: mockGetConnector,
}));

vi.mock("@/lib/integrations/gateway", () => ({
  processSync: mockProcessSync,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/integrations/encryption", () => ({
  decrypt: mockDecrypt,
}));

describe("sync-integration task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationsFromCount = 0;
    syncLogsFromCount = 0;

    mockIntegrationsSelectSingle.mockResolvedValue({
      data: {
        id: "int-1",
        provider: "gmail",
        access_token_encrypted: "enc-access",
        refresh_token_encrypted: "enc-refresh",
        sync_cursor: { historyId: "10" },
        metadata: { account: "acct-1" },
      },
      error: null,
    });

    mockSyncLogsInsertSingle.mockResolvedValue({
      data: { id: "log-1" },
      error: null,
    });

    mockConnectorSync.mockResolvedValue({
      people: [],
      interactions: [],
      cursor: { historyId: "11" },
      hasMore: false,
    });

    mockProcessSync.mockResolvedValue({
      peopleCreated: 1,
      peopleUpdated: 2,
      companiesCreated: 0,
      interactionsCreated: 3,
    });
  });

  it("passes decrypted tokens + metadata and clears last_sync_error on success", async () => {
    const { syncIntegration } = await import("@/src/trigger/sync-integration");

    const result = await (
      syncIntegration as unknown as {
        run: (payload: { integrationId: string; workspaceId: string }) => Promise<unknown>;
      }
    ).run({ integrationId: "int-1", workspaceId: "ws-1" });

    expect(mockConnectorSync).toHaveBeenCalledWith({
      accessToken: "dec:enc-access",
      refreshToken: "dec:enc-refresh",
      cursor: { historyId: "10" },
      metadata: { account: "acct-1" },
      workspaceId: "ws-1",
    });

    expect(mockIntegrationsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        last_sync_error: null,
        sync_cursor: { historyId: "11" },
      })
    );

    expect(result).toEqual({
      peopleCreated: 1,
      peopleUpdated: 2,
      companiesCreated: 0,
      interactionsCreated: 3,
    });
  });

  it("stores last_sync_error and throws when connector fails", async () => {
    mockConnectorSync.mockRejectedValue(new Error("Provider throttled"));

    const { syncIntegration } = await import("@/src/trigger/sync-integration");

    await expect(
      (
        syncIntegration as unknown as {
          run: (payload: { integrationId: string; workspaceId: string }) => Promise<unknown>;
        }
      ).run({ integrationId: "int-1", workspaceId: "ws-1" })
    ).rejects.toThrow("Provider throttled");

    expect(mockIntegrationsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        last_sync_error: "Provider throttled",
      })
    );

    expect(mockSyncLogsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_message: "Provider throttled",
      })
    );
  });
});
