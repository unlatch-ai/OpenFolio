/**
 * Search API Route Tests
 *
 * Verifies that the semantic search API properly implements:
 * - Auth via getWorkspaceContext
 * - Zod validation for query, entity_types, limit, threshold
 * - Parallel RPC calls to match_*_text functions
 * - Results sorted by similarity
 * - entity_types filtering
 * - Rate limiting
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

const mockRateLimit = vi.fn(() => ({
  ok: true,
  remaining: 29,
  resetAt: Date.now() + 60000,
  limit: 30,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockGenerateEmbedding = vi.fn();
vi.mock("@/lib/openai", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

// RPC mock results keyed by function name
let mockRpcResults: Record<string, { data: unknown; error: unknown }> = {};

const mockRpc = vi.fn((fnName: string) => {
  const result = mockRpcResults[fnName] ?? { data: [], error: null };
  return Promise.resolve(result);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
}));

// --- Helpers ---

const WORKSPACE_ID = "ws-test-123";
const USER_ID = "user-test-456";
const MOCK_EMBEDDING = [0.1, 0.2, 0.3];

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

function makeRequest(body: unknown): NextRequest {
  const headers = new Headers();
  headers.set("x-workspace-id", WORKSPACE_ID);
  headers.set("content-type", "application/json");

  return new NextRequest("http://localhost:3000/api/search", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpcResults = {};
    mockGenerateEmbedding.mockResolvedValue(MOCK_EMBEDDING);
    mockRateLimit.mockReturnValue({
      ok: true,
      remaining: 29,
      resetAt: Date.now() + 60000,
      limit: 30,
    });
  });

  it("returns 401 without auth", async () => {
    mockGetWorkspaceContext.mockResolvedValue(errorCtx(401, "Unauthorized"));

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "test" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 for missing query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "" }));

    expect(res.status).toBe(400);
  });

  it("returns people matching a text query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_people_text"] = {
      data: [
        { id: "p1", first_name: "Alice", similarity: 0.85 },
        { id: "p2", first_name: "Bob", similarity: 0.72 },
      ],
      error: null,
    };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "Alice", entity_types: ["people"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].type).toBe("person");
    expect(json.data[0].similarity).toBe(0.85);
    // Only people RPC should be called
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("match_people_text", expect.any(Object));
  });

  it("returns companies matching a text query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_companies_text"] = {
      data: [{ id: "c1", name: "Acme", similarity: 0.9 }],
      error: null,
    };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "Acme", entity_types: ["companies"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].type).toBe("company");
  });

  it("returns interactions matching a text query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_interactions_text"] = {
      data: [{ id: "i1", subject: "Meeting", similarity: 0.8 }],
      error: null,
    };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "meeting", entity_types: ["interactions"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].type).toBe("interaction");
  });

  it("returns notes matching a text query", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_notes_text"] = {
      data: [{ id: "n1", content: "Important note", similarity: 0.75 }],
      error: null,
    };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "important", entity_types: ["notes"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].type).toBe("note");
  });

  it("searches all default types when entity_types not specified", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_people_text"] = { data: [], error: null };
    mockRpcResults["match_companies_text"] = { data: [], error: null };
    mockRpcResults["match_interactions_text"] = { data: [], error: null };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(0);
    // Should call people, companies, interactions (not notes by default)
    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenCalledWith("match_people_text", expect.any(Object));
    expect(mockRpc).toHaveBeenCalledWith("match_companies_text", expect.any(Object));
    expect(mockRpc).toHaveBeenCalledWith("match_interactions_text", expect.any(Object));
  });

  it("sorts results by similarity descending across types", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_people_text"] = {
      data: [{ id: "p1", similarity: 0.7 }],
      error: null,
    };
    mockRpcResults["match_companies_text"] = {
      data: [{ id: "c1", similarity: 0.9 }],
      error: null,
    };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({
      query: "test",
      entity_types: ["people", "companies"],
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    // Company should be first (higher similarity)
    expect(json.data[0].type).toBe("company");
    expect(json.data[0].similarity).toBe(0.9);
    expect(json.data[1].type).toBe("person");
    expect(json.data[1].similarity).toBe(0.7);
  });

  it("returns empty array for no matches", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_people_text"] = { data: [], error: null };

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "nonexistent", entity_types: ["people"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(0);
  });

  it("passes correct parameters to RPC", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());
    mockRpcResults["match_people_text"] = { data: [], error: null };

    const { POST } = await import("@/app/api/search/route");
    await POST(makeRequest({
      query: "test query",
      entity_types: ["people"],
      limit: 10,
      threshold: 0.5,
    }));

    expect(mockGenerateEmbedding).toHaveBeenCalledWith("test query");
    expect(mockRpc).toHaveBeenCalledWith("match_people_text", {
      query_embedding: JSON.stringify(MOCK_EMBEDDING),
      match_threshold: 0.5,
      match_count: 10,
      p_workspace_id: WORKSPACE_ID,
    });
  });

  it("returns 400 for invalid entity_types", async () => {
    mockGetWorkspaceContext.mockResolvedValue(successCtx());

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({
      query: "test",
      entity_types: ["invalid_type"],
    }));

    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      limit: 30,
    });

    const { POST } = await import("@/app/api/search/route");
    const res = await POST(makeRequest({ query: "test" }));

    expect(res.status).toBe(429);
  });
});
