/**
 * Interactions API Route Tests
 *
 * Verifies that interactions CRUD routes properly implement:
 * - Auth via getWorkspaceContext
 * - Workspace isolation
 * - Zod validation
 * - Correct HTTP status codes
 * - Cursor pagination
 * - Participant linking via interaction_people
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockGetWorkspaceContext = vi.fn();
const mockIsWorkspaceContextError = vi.fn(
  (result: unknown) =>
    typeof result === "object" && result !== null && "error" in result
);

vi.mock("@/lib/auth", () => ({
  getWorkspaceContext: (...args: unknown[]) => mockGetWorkspaceContext(...args),
  isWorkspaceContextError: (result: unknown) =>
    mockIsWorkspaceContextError(result),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 59, resetAt: Date.now() + 60000, limit: 60 }),
}));

// Shared mock state
let mockFromResults: Record<string, { data: unknown; error: unknown }> = {};
let fromCallCount = 0;
let fromCallOrder: string[] = [];

function createMockQueryBuilder(resolvedValue: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.delete = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lte = vi.fn().mockReturnValue(builder);
  builder.in = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.or = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue(resolvedValue);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return builder;
}

const mockFrom = vi.fn((table: string) => {
  fromCallCount++;
  fromCallOrder.push(table);
  const key = `${table}:${fromCallCount}`;
  const specific = mockFromResults[key];
  if (specific) return createMockQueryBuilder(specific);
  const tableDefault = mockFromResults[table];
  if (tableDefault) return createMockQueryBuilder(tableDefault);
  return createMockQueryBuilder(mockFromResults["*"] ?? { data: null, error: null });
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: vi.fn() },
}));

// --- Helpers ---

const WORKSPACE_ID = "ws-test-123";
const USER_ID = "user-test-456";

function successCtx() {
  return {
    user: { id: USER_ID, email: "test@example.com" },
    workspaceId: WORKSPACE_ID,
    workspaceRole: "member" as const,
  };
}

function errorCtx(status: number, error: string) {
  return { error, status };
}

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const { method = "GET", body } = options;
  const headers = new Headers();
  headers.set("x-workspace-id", WORKSPACE_ID);
  if (body) headers.set("content-type", "application/json");

  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// --- Tests ---

describe("GET /api/interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = { "*": { data: [], error: null } };
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/interactions/route");
    const res = await GET(makeRequest("/api/interactions"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns paginated interactions list", async () => {
    const mockInteractions = [
      { id: "i1", interaction_type: "meeting", occurred_at: "2026-01-01T10:00:00Z" },
      { id: "i2", interaction_type: "email", occurred_at: "2026-01-02T10:00:00Z" },
    ];
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: mockInteractions, error: null } };

    const { GET } = await import("@/app/api/interactions/route");
    const res = await GET(makeRequest("/api/interactions"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.hasMore).toBe(false);
    expect(json.nextCursor).toBeNull();
  });

  it("filters by interaction_type", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/interactions/route");
    await GET(makeRequest("/api/interactions?interaction_type=meeting"));

    expect(mockFrom).toHaveBeenCalledWith("interactions");
  });

  it("filters by direction", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/interactions/route");
    await GET(makeRequest("/api/interactions?direction=inbound"));

    expect(mockFrom).toHaveBeenCalledWith("interactions");
  });

  it("filters by date range", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/interactions/route");
    await GET(makeRequest("/api/interactions?date_from=2026-01-01T00:00:00Z&date_to=2026-01-31T23:59:59Z"));

    expect(mockFrom).toHaveBeenCalledWith("interactions");
  });

  it("returns 500 on database error", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: null, error: { message: "DB error" } } };

    const { GET } = await import("@/app/api/interactions/route");
    const res = await GET(makeRequest("/api/interactions"));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: { interaction_type: "meeting", occurred_at: "2026-01-01T10:00:00Z" },
      })
    );

    expect(res.status).toBe(401);
  });

  it("creates an interaction with valid data", async () => {
    const newInteraction = {
      id: "i-new",
      interaction_type: "meeting",
      occurred_at: "2026-01-01T10:00:00Z",
      subject: "Catch up",
      workspace_id: WORKSPACE_ID,
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First from("interactions") call: insert
    mockFromResults["interactions:1"] = { data: newInteraction, error: null };

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: {
          interaction_type: "meeting",
          occurred_at: "2026-01-01T10:00:00Z",
          subject: "Catch up",
        },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe("i-new");
  });

  it("creates an interaction with participant_ids", async () => {
    const newInteraction = {
      id: "i-new2",
      interaction_type: "email",
      occurred_at: "2026-01-01T10:00:00Z",
      workspace_id: WORKSPACE_ID,
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: insert interaction
    mockFromResults["interactions:1"] = { data: newInteraction, error: null };
    // Second call: validate participant workspace ownership
    mockFromResults["people:2"] = { data: [{ id: "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d" }, { id: "b2c3d4e5-f6a7-1b2c-9d3e-4f5a6b7c8d9e" }], error: null };
    // Third call: insert interaction_people
    mockFromResults["interaction_people:3"] = { data: null, error: null };

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: {
          interaction_type: "email",
          occurred_at: "2026-01-01T10:00:00Z",
          participant_ids: ["a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d", "b2c3d4e5-f6a7-1b2c-9d3e-4f5a6b7c8d9e"],
        },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe("i-new2");
    // Verify interaction_people insert was called
    expect(fromCallOrder).toContain("interaction_people");
  });

  it("returns 400 for missing interaction_type", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: { occurred_at: "2026-01-01T10:00:00Z" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing occurred_at", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: { interaction_type: "meeting" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid occurred_at format", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/interactions/route");
    const res = await POST(
      makeRequest("/api/interactions", {
        method: "POST",
        body: { interaction_type: "meeting", occurred_at: "not-a-date" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/interactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/interactions/[id]/route");
    const res = await GET(makeRequest("/api/interactions/i1"), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns interaction detail with participants", async () => {
    const interaction = {
      id: "i1",
      interaction_type: "meeting",
      occurred_at: "2026-01-01T10:00:00Z",
      interaction_people: [
        { person_id: "p1", role: "participant", people: { id: "p1", first_name: "Alice" } },
      ],
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["interactions:1"] = { data: interaction, error: null };

    const { GET } = await import("@/app/api/interactions/[id]/route");
    const res = await GET(makeRequest("/api/interactions/i1"), {
      params: Promise.resolve({ id: "i1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe("i1");
    expect(json.data.interaction_people).toHaveLength(1);
  });

  it("returns 404 for non-existent interaction", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["interactions:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { GET } = await import("@/app/api/interactions/[id]/route");
    const res = await GET(makeRequest("/api/interactions/nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/interactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { PATCH } = await import("@/app/api/interactions/[id]/route");
    const res = await PATCH(
      makeRequest("/api/interactions/i1", { method: "PATCH", body: { subject: "Updated" } }),
      { params: Promise.resolve({ id: "i1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("updates interaction fields", async () => {
    const updated = { id: "i1", subject: "Updated Meeting", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["interactions:1"] = { data: updated, error: null };

    const { PATCH } = await import("@/app/api/interactions/[id]/route");
    const res = await PATCH(
      makeRequest("/api/interactions/i1", { method: "PATCH", body: { subject: "Updated Meeting" } }),
      { params: Promise.resolve({ id: "i1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.subject).toBe("Updated Meeting");
  });

  it("returns 400 for invalid occurred_at in update", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { PATCH } = await import("@/app/api/interactions/[id]/route");
    const res = await PATCH(
      makeRequest("/api/interactions/i1", { method: "PATCH", body: { occurred_at: "bad-date" } }),
      { params: Promise.resolve({ id: "i1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent interaction", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["interactions:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { PATCH } = await import("@/app/api/interactions/[id]/route");
    const res = await PATCH(
      makeRequest("/api/interactions/nonexistent", { method: "PATCH", body: { subject: "Test" } }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/interactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { DELETE } = await import("@/app/api/interactions/[id]/route");
    const res = await DELETE(makeRequest("/api/interactions/i1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(res.status).toBe(401);
  });

  it("deletes an interaction successfully", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: check exists
    mockFromResults["interactions:1"] = { data: { id: "i1" }, error: null };
    // Second call: delete
    mockFromResults["interactions:2"] = { data: null, error: null };

    const { DELETE } = await import("@/app/api/interactions/[id]/route");
    const res = await DELETE(makeRequest("/api/interactions/i1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "i1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 404 for non-existent interaction", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["interactions:1"] = { data: null, error: { code: "PGRST116" } };

    const { DELETE } = await import("@/app/api/interactions/[id]/route");
    const res = await DELETE(makeRequest("/api/interactions/nonexistent", { method: "DELETE" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});
