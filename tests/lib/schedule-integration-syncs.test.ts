import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTrigger = vi.fn();
const mockFrom = vi.fn();

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (params: unknown) => params,
  },
  tasks: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

function createThenableBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.then = vi.fn((resolve: (value: unknown) => void) =>
    resolve(result)
  );
  return builder;
}

describe("scheduleIntegrationSyncs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers only integrations matching local scheduled time", async () => {
    mockFrom.mockReturnValue(
      createThenableBuilder({
        data: [
          {
            id: "int-match",
            workspace_id: "ws-1",
            auto_sync_enabled: true,
            auto_sync_time_local: "02:00:00",
            auto_sync_timezone: "UTC",
            status: "active",
            workspaces: { settings: { timezone: "UTC" } },
          },
          {
            id: "int-miss",
            workspace_id: "ws-1",
            auto_sync_enabled: true,
            auto_sync_time_local: "03:00:00",
            auto_sync_timezone: "UTC",
            status: "active",
            workspaces: { settings: { timezone: "UTC" } },
          },
        ],
        error: null,
      })
    );

    const { scheduleIntegrationSyncs } = await import(
      "@/src/trigger/schedule-integration-syncs"
    );

    const result = await (
      scheduleIntegrationSyncs as unknown as {
        run: (payload: unknown) => Promise<{ triggered: number }>;
      }
    ).run({} as never);

    expect(result.triggered).toBe(1);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger).toHaveBeenCalledWith(
      "sync-integration",
      { integrationId: "int-match", workspaceId: "ws-1" },
      { idempotencyKey: "autosync:int-match:2026-02-20" }
    );
  });

  it("uses workspace timezone fallback when integration timezone is missing", async () => {
    const { __testables__ } = await import("@/src/trigger/schedule-integration-syncs");
    expect(__testables__.resolveTimezone(null, { timezone: "America/New_York" })).toBe(
      "America/New_York"
    );
    expect(__testables__.resolveTimezone(null, {})).toBe("UTC");
  });
});
