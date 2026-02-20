import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTrigger = vi.fn();
const mockFrom = vi.fn();

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (params: unknown) => params,
  },
  task: (params: unknown) => ({
    ...((params as Record<string, unknown>) || {}),
    trigger: (...args: unknown[]) => mockTrigger(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/src/trigger/sync-integration", () => ({
  syncIntegration: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
}));

function makeFromReturning(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  return builder;
}

describe("syncIntegrationScheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when externalId is missing", async () => {
    const { syncIntegrationScheduled } = await import(
      "@/src/trigger/sync-integration-scheduled"
    );
    const result = await (
      syncIntegrationScheduled as unknown as {
        run: (p: unknown) => Promise<unknown>;
      }
    ).run({ externalId: undefined });
    expect(result).toEqual({ skipped: true });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("skips when integration is not found", async () => {
    mockFrom.mockReturnValue(makeFromReturning(null, { code: "PGRST116" }));
    const { syncIntegrationScheduled } = await import(
      "@/src/trigger/sync-integration-scheduled"
    );
    const result = await (
      syncIntegrationScheduled as unknown as {
        run: (p: unknown) => Promise<unknown>;
      }
    ).run({ externalId: "int-1" });
    expect(result).toEqual({ skipped: true });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("skips when integration status is not active", async () => {
    mockFrom.mockReturnValue(
      makeFromReturning({ workspace_id: "ws-1", status: "error" })
    );
    const { syncIntegrationScheduled } = await import(
      "@/src/trigger/sync-integration-scheduled"
    );
    const result = await (
      syncIntegrationScheduled as unknown as {
        run: (p: unknown) => Promise<unknown>;
      }
    ).run({ externalId: "int-1" });
    expect((result as Record<string, unknown>).skipped).toBe(true);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("triggers syncIntegration with correct payload when integration is active", async () => {
    mockFrom.mockReturnValue(
      makeFromReturning({ workspace_id: "ws-1", status: "active" })
    );
    mockTrigger.mockResolvedValue({ id: "run-1" });
    const { syncIntegrationScheduled } = await import(
      "@/src/trigger/sync-integration-scheduled"
    );
    const result = await (
      syncIntegrationScheduled as unknown as {
        run: (p: unknown) => Promise<unknown>;
      }
    ).run({ externalId: "int-1" });
    expect(result).toEqual({ triggered: true, integrationId: "int-1" });
    expect(mockTrigger).toHaveBeenCalledWith({
      integrationId: "int-1",
      workspaceId: "ws-1",
    });
  });
});
