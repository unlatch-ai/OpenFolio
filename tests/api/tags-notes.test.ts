/**
 * Tags & Notes API Route Tests
 *
 * Verifies that tags and notes CRUD routes properly implement:
 * - Auth via getWorkspaceContext
 * - Workspace isolation
 * - Zod validation
 * - Correct HTTP status codes
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
  // Make builder thenable so it resolves when awaited directly (e.g. after .order())
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
const VALID_UUID = "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d";

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

// --- Tags Tests ---

describe("GET /api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = { "*": { data: [], error: null } };
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/tags/route");
    const res = await GET(makeRequest("/api/tags"));

    expect(res.status).toBe(401);
  });

  it("returns all workspace tags", async () => {
    const mockTags = [
      { id: "t1", name: "VIP", color: "#ff0000" },
      { id: "t2", name: "Lead", color: "#00ff00" },
    ];
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: mockTags, error: null } };

    const { GET } = await import("@/app/api/tags/route");
    const res = await GET(makeRequest("/api/tags"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
  });

  it("returns 500 on database error", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: null, error: { message: "DB error" } } };

    const { GET } = await import("@/app/api/tags/route");
    const res = await GET(makeRequest("/api/tags"));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      makeRequest("/api/tags", { method: "POST", body: { name: "Test" } })
    );

    expect(res.status).toBe(401);
  });

  it("creates a tag with valid data", async () => {
    const newTag = { id: "t-new", name: "Important", color: "#0000ff", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: duplicate check — not found
    mockFromResults["tags:1"] = { data: null, error: { code: "PGRST116" } };
    // Second call: insert
    mockFromResults["tags:2"] = { data: newTag, error: null };

    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      makeRequest("/api/tags", { method: "POST", body: { name: "Important", color: "#0000ff" } })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.name).toBe("Important");
  });

  it("returns 400 for missing name", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      makeRequest("/api/tags", { method: "POST", body: { color: "#ff0000" } })
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate name", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["tags:1"] = { data: { id: "existing" }, error: null };

    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      makeRequest("/api/tags", { method: "POST", body: { name: "Duplicate" } })
    );

    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { DELETE } = await import("@/app/api/tags/route");
    const res = await DELETE(makeRequest("/api/tags?id=t1", { method: "DELETE" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when id param is missing", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { DELETE } = await import("@/app/api/tags/route");
    const res = await DELETE(makeRequest("/api/tags", { method: "DELETE" }));

    expect(res.status).toBe(400);
  });

  it("deletes a tag successfully", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["tags:1"] = { data: { id: "t1" }, error: null };
    mockFromResults["tags:2"] = { data: null, error: null };

    const { DELETE } = await import("@/app/api/tags/route");
    const res = await DELETE(makeRequest("/api/tags?id=t1", { method: "DELETE" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 404 for non-existent tag", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["tags:1"] = { data: null, error: { code: "PGRST116" } };

    const { DELETE } = await import("@/app/api/tags/route");
    const res = await DELETE(makeRequest("/api/tags?id=nonexistent", { method: "DELETE" }));

    expect(res.status).toBe(404);
  });
});

// --- Person Tags Tests ---

describe("POST /api/people/[id]/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/people/[id]/tags/route");
    const res = await POST(
      makeRequest("/api/people/p1/tags", { method: "POST", body: { tag_id: VALID_UUID } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("adds a tag to a person", async () => {
    const link = { person_id: "p1", tag_id: VALID_UUID, workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["people"] = { data: { id: "p1" }, error: null };
    mockFromResults["person_tags:2"] = { data: link, error: null };

    const { POST } = await import("@/app/api/people/[id]/tags/route");
    const res = await POST(
      makeRequest("/api/people/p1/tags", { method: "POST", body: { tag_id: VALID_UUID } }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.tag_id).toBe(VALID_UUID);
  });

  it("returns 400 for invalid tag_id", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/people/[id]/tags/route");
    const res = await POST(
      makeRequest("/api/people/p1/tags", { method: "POST", body: { tag_id: "not-a-uuid" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate tag assignment", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["people"] = { data: { id: "p1" }, error: null };
    mockFromResults["person_tags:2"] = { data: null, error: { code: "23505", message: "duplicate" } };

    const { POST } = await import("@/app/api/people/[id]/tags/route");
    const res = await POST(
      makeRequest("/api/people/p1/tags", { method: "POST", body: { tag_id: VALID_UUID } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/people/[id]/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { DELETE } = await import("@/app/api/people/[id]/tags/route");
    const res = await DELETE(
      makeRequest("/api/people/p1/tags", { method: "DELETE", body: { tag_id: VALID_UUID } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("removes a tag from a person", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["person_tags:1"] = { data: null, error: null };

    const { DELETE } = await import("@/app/api/people/[id]/tags/route");
    const res = await DELETE(
      makeRequest("/api/people/p1/tags", { method: "DELETE", body: { tag_id: VALID_UUID } }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 400 for missing tag_id", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { DELETE } = await import("@/app/api/people/[id]/tags/route");
    const res = await DELETE(
      makeRequest("/api/people/p1/tags", { method: "DELETE", body: {} }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
  });
});

// --- Person Notes Tests ---

describe("GET /api/people/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = { "*": { data: [], error: null } };
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/people/[id]/notes/route");
    const res = await GET(makeRequest("/api/people/p1/notes"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns notes for a person", async () => {
    const mockNotes = [
      { id: "n1", content: "First note", person_id: "p1" },
      { id: "n2", content: "Second note", person_id: "p1" },
    ];
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: mockNotes, error: null } };

    const { GET } = await import("@/app/api/people/[id]/notes/route");
    const res = await GET(makeRequest("/api/people/p1/notes"), {
      params: Promise.resolve({ id: "p1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
  });

  it("returns 500 on database error", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: null, error: { message: "DB error" } } };

    const { GET } = await import("@/app/api/people/[id]/notes/route");
    const res = await GET(makeRequest("/api/people/p1/notes"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(500);
  });
});

describe("POST /api/people/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/people/[id]/notes/route");
    const res = await POST(
      makeRequest("/api/people/p1/notes", { method: "POST", body: { content: "Test note" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("creates a note for a person", async () => {
    const newNote = { id: "n-new", content: "Test note", person_id: "p1", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["people"] = { data: { id: "p1" }, error: null };
    mockFromResults["notes:2"] = { data: newNote, error: null };

    const { POST } = await import("@/app/api/people/[id]/notes/route");
    const res = await POST(
      makeRequest("/api/people/p1/notes", { method: "POST", body: { content: "Test note" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.content).toBe("Test note");
  });

  it("returns 400 for missing content", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/people/[id]/notes/route");
    const res = await POST(
      makeRequest("/api/people/p1/notes", { method: "POST", body: {} }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty content", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/people/[id]/notes/route");
    const res = await POST(
      makeRequest("/api/people/p1/notes", { method: "POST", body: { content: "" } }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
  });
});
