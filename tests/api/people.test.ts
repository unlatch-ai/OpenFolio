/**
 * People API Route Tests
 *
 * Verifies that people CRUD routes properly implement:
 * - Auth via getWorkspaceContext
 * - Workspace isolation
 * - Zod validation
 * - Correct HTTP status codes
 * - Cursor pagination
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
  builder.order = vi.fn().mockReturnValue(builder);
  builder.or = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue(resolvedValue);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  return builder;
}

// Setup mock from() to return different results per call
const mockFrom = vi.fn((table: string) => {
  fromCallCount++;
  fromCallOrder.push(table);
  const key = `${table}:${fromCallCount}`;
  const specific = mockFromResults[key];
  if (specific) return createMockQueryBuilder(specific);
  // Fall back to table-level default
  const tableDefault = mockFromResults[table];
  if (tableDefault) return createMockQueryBuilder(tableDefault);
  // Fall back to global default
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

describe("GET /api/people", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = { "*": { data: [], error: null } };
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/people/route");
    const res = await GET(makeRequest("/api/people"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns paginated people list for authenticated user", async () => {
    const mockPeople = [
      { id: "p1", first_name: "Alice", updated_at: "2026-01-01T00:00:00Z" },
      { id: "p2", first_name: "Bob", updated_at: "2026-01-02T00:00:00Z" },
    ];
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: mockPeople, error: null } };

    const { GET } = await import("@/app/api/people/route");
    const res = await GET(makeRequest("/api/people"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.hasMore).toBe(false);
    expect(json.nextCursor).toBeNull();
  });

  it("filters by relationship_type", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/people/route");
    await GET(makeRequest("/api/people?relationship_type=friend"));

    expect(mockFrom).toHaveBeenCalledWith("people");
  });

  it("returns 500 on database error", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: null, error: { message: "DB error" } } };

    const { GET } = await import("@/app/api/people/route");
    const res = await GET(makeRequest("/api/people"));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/people", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/people/route");
    const res = await POST(
      makeRequest("/api/people", { method: "POST", body: { first_name: "Test" } })
    );

    expect(res.status).toBe(401);
  });

  it("creates a person with valid data", async () => {
    const newPerson = {
      id: "p-new",
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
      workspace_id: WORKSPACE_ID,
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First from("people") call: duplicate check — not found
    mockFromResults["people:1"] = { data: null, error: { code: "PGRST116" } };
    // Second from("people") call: insert
    mockFromResults["people:2"] = { data: newPerson, error: null };

    const { POST } = await import("@/app/api/people/route");
    const res = await POST(
      makeRequest("/api/people", {
        method: "POST",
        body: { first_name: "Alice", last_name: "Smith", email: "alice@example.com" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toBeDefined();
    expect(json.data.id).toBe("p-new");
  });

  it("creates a person without email (no dup check needed)", async () => {
    const newPerson = { id: "p-new2", first_name: "Bob", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // Only one from("people") call: insert (no email = no dup check)
    mockFromResults["people:1"] = { data: newPerson, error: null };

    const { POST } = await import("@/app/api/people/route");
    const res = await POST(
      makeRequest("/api/people", { method: "POST", body: { first_name: "Bob" } })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.first_name).toBe("Bob");
  });

  it("returns 400 for invalid email", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/people/route");
    const res = await POST(
      makeRequest("/api/people", { method: "POST", body: { email: "not-an-email" } })
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // Duplicate check finds existing person
    mockFromResults["people:1"] = { data: { id: "existing-id" }, error: null };

    const { POST } = await import("@/app/api/people/route");
    const res = await POST(
      makeRequest("/api/people", {
        method: "POST",
        body: { email: "dup@example.com", first_name: "Dup" },
      })
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/people/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/people/[id]/route");
    const res = await GET(makeRequest("/api/people/p1"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns person detail with related data", async () => {
    const person = {
      id: "p1",
      first_name: "Alice",
      social_profiles: [],
      person_companies: [],
      person_tags: [],
      notes: [],
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: get person
    mockFromResults["people:1"] = { data: person, error: null };
    // Second call: get interactions
    mockFromResults["interaction_people:2"] = { data: [], error: null };

    const { GET } = await import("@/app/api/people/[id]/route");
    const res = await GET(makeRequest("/api/people/p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe("p1");
    expect(json.data.recent_interactions).toBeDefined();
  });

  it("returns 404 for non-existent person", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // Person not found
    mockFromResults["people:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { GET } = await import("@/app/api/people/[id]/route");
    const res = await GET(makeRequest("/api/people/nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/people/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { PATCH } = await import("@/app/api/people/[id]/route");
    const res = await PATCH(
      makeRequest("/api/people/p1", { method: "PATCH", body: { first_name: "Updated" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("updates person fields", async () => {
    const updated = { id: "p1", first_name: "Updated", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["people:1"] = { data: updated, error: null };

    const { PATCH } = await import("@/app/api/people/[id]/route");
    const res = await PATCH(
      makeRequest("/api/people/p1", { method: "PATCH", body: { first_name: "Updated" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.first_name).toBe("Updated");
  });

  it("returns 400 for invalid email in update", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { PATCH } = await import("@/app/api/people/[id]/route");
    const res = await PATCH(
      makeRequest("/api/people/p1", { method: "PATCH", body: { email: "bad" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent person", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["people:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { PATCH } = await import("@/app/api/people/[id]/route");
    const res = await PATCH(
      makeRequest("/api/people/nonexistent", { method: "PATCH", body: { first_name: "Test" } }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/people/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { DELETE } = await import("@/app/api/people/[id]/route");
    const res = await DELETE(makeRequest("/api/people/p1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(401);
  });

  it("deletes a person successfully", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: check exists
    mockFromResults["people:1"] = { data: { id: "p1" }, error: null };
    // Second call: delete
    mockFromResults["people:2"] = { data: null, error: null };

    const { DELETE } = await import("@/app/api/people/[id]/route");
    const res = await DELETE(makeRequest("/api/people/p1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 404 for non-existent person", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // Person not found
    mockFromResults["people:1"] = { data: null, error: { code: "PGRST116" } };

    const { DELETE } = await import("@/app/api/people/[id]/route");
    const res = await DELETE(makeRequest("/api/people/nonexistent", { method: "DELETE" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});
