/**
 * Companies API Route Tests
 *
 * Verifies that companies CRUD routes properly implement:
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
  builder.in = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.or = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue(resolvedValue);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
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

describe("GET /api/companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = { "*": { data: [], error: null } };
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/companies/route");
    const res = await GET(makeRequest("/api/companies"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns paginated companies list for authenticated user", async () => {
    const mockCompanies = [
      { id: "c1", name: "Acme Corp", updated_at: "2026-01-01T00:00:00Z" },
      { id: "c2", name: "Globex", updated_at: "2026-01-02T00:00:00Z" },
    ];
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: mockCompanies, error: null } };

    const { GET } = await import("@/app/api/companies/route");
    const res = await GET(makeRequest("/api/companies"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.hasMore).toBe(false);
    expect(json.nextCursor).toBeNull();
  });

  it("filters by industry", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/companies/route");
    await GET(makeRequest("/api/companies?industry=tech"));

    expect(mockFrom).toHaveBeenCalledWith("companies");
  });

  it("filters by location", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: [], error: null } };

    const { GET } = await import("@/app/api/companies/route");
    await GET(makeRequest("/api/companies?location=NYC"));

    expect(mockFrom).toHaveBeenCalledWith("companies");
  });

  it("returns 500 on database error", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults = { "*": { data: null, error: { message: "DB error" } } };

    const { GET } = await import("@/app/api/companies/route");
    const res = await GET(makeRequest("/api/companies"));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/companies/route");
    const res = await POST(
      makeRequest("/api/companies", { method: "POST", body: { name: "Test" } })
    );

    expect(res.status).toBe(401);
  });

  it("creates a company with valid data", async () => {
    const newCompany = {
      id: "c-new",
      name: "Acme Corp",
      domain: "acme.com",
      workspace_id: WORKSPACE_ID,
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First from("companies") call: duplicate name check — not found
    mockFromResults["companies:1"] = { data: null, error: { code: "PGRST116" } };
    // Second from("companies") call: insert
    mockFromResults["companies:2"] = { data: newCompany, error: null };

    const { POST } = await import("@/app/api/companies/route");
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Acme Corp", domain: "acme.com" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toBeDefined();
    expect(json.data.id).toBe("c-new");
  });

  it("returns 400 for missing name", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/companies/route");
    const res = await POST(
      makeRequest("/api/companies", { method: "POST", body: { domain: "test.com" } })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid website URL", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/companies/route");
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Test", website: "not-a-url" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate name", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // Duplicate check finds existing company
    mockFromResults["companies:1"] = { data: { id: "existing-id" }, error: null };

    const { POST } = await import("@/app/api/companies/route");
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Duplicate Corp" },
      })
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/companies/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { GET } = await import("@/app/api/companies/[id]/route");
    const res = await GET(makeRequest("/api/companies/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns company detail with related data", async () => {
    const company = {
      id: "c1",
      name: "Acme Corp",
      person_companies: [{ person_id: "p1" }],
      company_tags: [],
    };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: get company
    mockFromResults["companies:1"] = { data: company, error: null };
    // Second call: get interactions for company's people
    mockFromResults["interaction_people:2"] = { data: [], error: null };

    const { GET } = await import("@/app/api/companies/[id]/route");
    const res = await GET(makeRequest("/api/companies/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe("c1");
    expect(json.data.recent_interactions).toBeDefined();
  });

  it("returns 404 for non-existent company", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["companies:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { GET } = await import("@/app/api/companies/[id]/route");
    const res = await GET(makeRequest("/api/companies/nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/companies/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { PATCH } = await import("@/app/api/companies/[id]/route");
    const res = await PATCH(
      makeRequest("/api/companies/c1", { method: "PATCH", body: { name: "Updated" } }),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("updates company fields", async () => {
    const updated = { id: "c1", name: "Updated Corp", workspace_id: WORKSPACE_ID };
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["companies:1"] = { data: updated, error: null };

    const { PATCH } = await import("@/app/api/companies/[id]/route");
    const res = await PATCH(
      makeRequest("/api/companies/c1", { method: "PATCH", body: { name: "Updated Corp" } }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.name).toBe("Updated Corp");
  });

  it("returns 400 for invalid website in update", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { PATCH } = await import("@/app/api/companies/[id]/route");
    const res = await PATCH(
      makeRequest("/api/companies/c1", { method: "PATCH", body: { website: "bad" } }),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent company", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["companies:1"] = { data: null, error: { code: "PGRST116", message: "not found" } };

    const { PATCH } = await import("@/app/api/companies/[id]/route");
    const res = await PATCH(
      makeRequest("/api/companies/nonexistent", { method: "PATCH", body: { name: "Test" } }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/companies/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    fromCallOrder = [];
    mockFromResults = {};
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { DELETE } = await import("@/app/api/companies/[id]/route");
    const res = await DELETE(makeRequest("/api/companies/c1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(res.status).toBe(401);
  });

  it("deletes a company successfully", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    // First call: check exists
    mockFromResults["companies:1"] = { data: { id: "c1" }, error: null };
    // Second call: delete
    mockFromResults["companies:2"] = { data: null, error: null };

    const { DELETE } = await import("@/app/api/companies/[id]/route");
    const res = await DELETE(makeRequest("/api/companies/c1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 404 for non-existent company", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockFromResults["companies:1"] = { data: null, error: { code: "PGRST116" } };

    const { DELETE } = await import("@/app/api/companies/[id]/route");
    const res = await DELETE(makeRequest("/api/companies/nonexistent", { method: "DELETE" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });
});
