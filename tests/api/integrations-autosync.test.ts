import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetWorkspaceContext = vi.fn();
const mockIsWorkspaceContextError = vi.fn(
  (result: unknown) =>
    typeof result === "object" && result !== null && "error" in result
);

vi.mock("@/lib/auth", () => ({
  getWorkspaceContext: (...args: unknown[]) => mockGetWorkspaceContext(...args),
  isWorkspaceContextError: (result: unknown) => mockIsWorkspaceContextError(result),
}));

let mockFromResults: Record<string, { data: unknown; error: unknown }> = {};
let fromCallCount = 0;

function createMockBuilder(resolvedValue: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  return builder;
}

const mockFrom = vi.fn((table: string) => {
  fromCallCount++;
  const byCall = mockFromResults[`${table}:${fromCallCount}`];
  if (byCall) return createMockBuilder(byCall);
  const byTable = mockFromResults[table];
  if (byTable) return createMockBuilder(byTable);
  return createMockBuilder({ data: null, error: null });
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}));

function makeRequest(body: unknown) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-workspace-id": "ws-123",
  });
  return new NextRequest("http://localhost:3000/api/integrations/int-1/autosync", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/integrations/[id]/autosync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    mockFromResults = {};
  });

  it("returns 401 when unauthorized", async () => {
    mockGetWorkspaceContext.mockResolvedValue({ error: "Unauthorized", status: 401 });

    const { PATCH } = await import("@/app/api/integrations/[id]/autosync/route");
    const response = await PATCH(makeRequest({ autoSyncEnabled: true }), {
      params: Promise.resolve({ id: "int-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid timezone", async () => {
    mockGetWorkspaceContext.mockResolvedValue({
      user: { id: "user-1" },
      workspaceId: "ws-123",
      workspaceRole: "owner",
    });

    const { PATCH } = await import("@/app/api/integrations/[id]/autosync/route");
    const response = await PATCH(
      makeRequest({ autoSyncEnabled: true, autoSyncTimezone: "Not/A-Real-Timezone" }),
      {
        params: Promise.resolve({ id: "int-1" }),
      }
    );

    expect(response.status).toBe(400);
  });

  it("updates autosync settings", async () => {
    mockGetWorkspaceContext.mockResolvedValue({
      user: { id: "user-1" },
      workspaceId: "ws-123",
      workspaceRole: "owner",
    });

    mockFromResults["integrations:1"] = {
      data: { id: "int-1" },
      error: null,
    };
    mockFromResults["integrations:2"] = {
      data: {
        id: "int-1",
        auto_sync_enabled: true,
        auto_sync_time_local: "06:30:00",
        auto_sync_timezone: "America/New_York",
      },
      error: null,
    };

    const { PATCH } = await import("@/app/api/integrations/[id]/autosync/route");
    const response = await PATCH(
      makeRequest({
        autoSyncEnabled: true,
        autoSyncTimeLocal: "06:30",
        autoSyncTimezone: "America/New_York",
      }),
      {
        params: Promise.resolve({ id: "int-1" }),
      }
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.autoSyncEnabled).toBe(true);
    expect(json.autoSyncTimeLocal).toBe("06:30");
    expect(json.autoSyncTimezone).toBe("America/New_York");
  });
});
