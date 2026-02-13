/**
 * AI Tool Tests
 *
 * Tests the dedicated search, detail, and note-taking tools
 * for correct data shape, workspace isolation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

vi.mock("@/lib/openai", () => ({
  generateEmbedding: vi.fn(async () => new Array(1536).fill(0.1)),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: vi.fn(),
  })),
}));

// --- Helpers ---

const WORKSPACE_ID = "ws-test-123";
const USER_ID = "user-test-456";
const VALID_UUID = "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d";

function toolContext() {
  return { workspaceId: WORKSPACE_ID, userId: USER_ID };
}

function createMockQueryBuilder(resolvedValue: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.ilike = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  builder.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(resolvedValue));
  return builder;
}

// --- Tests ---

describe("searchPeopleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search results with correct shape", async () => {
    const mockResults = [
      {
        id: "p1",
        first_name: "Alice",
        last_name: "Smith",
        display_name: "Alice Smith",
        email: "alice@test.com",
        phone: null,
        location: "NYC",
        bio: "Engineer",
        relationship_type: "colleague",
        relationship_strength: 0.8,
        last_contacted_at: "2026-01-01T00:00:00Z",
        similarity: 0.9,
      },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchPeopleTool } = await import("@/lib/ai/tools");
    const result = await searchPeopleTool.execute(
      { query: "Alice", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("count", 1);
    const results = (result as { results: unknown[] }).results;
    expect(results[0]).toHaveProperty("id", "p1");
    expect(results[0]).toHaveProperty("first_name", "Alice");
    expect(results[0]).toHaveProperty("similarity");
  });

  it("filters by relationship_type", async () => {
    const mockResults = [
      { id: "p1", relationship_type: "colleague", similarity: 0.9 },
      { id: "p2", relationship_type: "friend", similarity: 0.8 },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchPeopleTool } = await import("@/lib/ai/tools");
    const result = await searchPeopleTool.execute(
      { query: "test", relationship_type: "colleague", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    const results = (result as { results: unknown[]; count: number }).results;
    expect(results).toHaveLength(1);
    expect(result).toHaveProperty("count", 1);
  });

  it("passes workspace_id to RPC", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { searchPeopleTool } = await import("@/lib/ai/tools");
    await searchPeopleTool.execute(
      { query: "test", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(mockRpc).toHaveBeenCalledWith("match_people_text", {
      query_embedding: expect.any(String),
      match_threshold: 0.3,
      match_count: 10,
      p_workspace_id: WORKSPACE_ID,
    });
  });

  it("returns error on RPC failure", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB error" } });

    const { searchPeopleTool } = await import("@/lib/ai/tools");
    const result = await searchPeopleTool.execute(
      { query: "test", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("DB error");
  });
});

describe("searchCompaniesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns company results with correct shape", async () => {
    const mockResults = [
      {
        id: "c1",
        name: "Acme Corp",
        domain: "acme.com",
        industry: "Technology",
        location: "SF",
        description: "A tech company",
        similarity: 0.85,
      },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchCompaniesTool } = await import("@/lib/ai/tools");
    const result = await searchCompaniesTool.execute(
      { query: "tech", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("count", 1);
    const results = (result as { results: unknown[] }).results;
    expect(results[0]).toHaveProperty("name", "Acme Corp");
  });

  it("filters by industry", async () => {
    const mockResults = [
      { id: "c1", name: "TechCo", industry: "Technology", similarity: 0.9 },
      { id: "c2", name: "HealthCo", industry: "Healthcare", similarity: 0.8 },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchCompaniesTool } = await import("@/lib/ai/tools");
    const result = await searchCompaniesTool.execute(
      { query: "company", industry: "tech", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect((result as { count: number }).count).toBe(1);
  });

  it("filters by location", async () => {
    const mockResults = [
      { id: "c1", name: "SFCo", location: "San Francisco", similarity: 0.9 },
      { id: "c2", name: "NYCo", location: "New York", similarity: 0.8 },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchCompaniesTool } = await import("@/lib/ai/tools");
    const result = await searchCompaniesTool.execute(
      { query: "company", location: "francisco", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect((result as { count: number }).count).toBe(1);
  });
});

describe("searchInteractionsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns interaction results with correct shape", async () => {
    const mockResults = [
      {
        id: "i1",
        interaction_type: "meeting",
        subject: "Quarterly Review",
        direction: "outbound",
        occurred_at: "2026-01-15T10:00:00Z",
        notes: "Discussed Q1 goals",
        similarity: 0.88,
      },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchInteractionsTool } = await import("@/lib/ai/tools");
    const result = await searchInteractionsTool.execute(
      { query: "meeting", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("results");
    const results = (result as { results: unknown[] }).results;
    expect(results[0]).toHaveProperty("interaction_type", "meeting");
    expect(results[0]).toHaveProperty("subject", "Quarterly Review");
  });

  it("filters by interaction_type", async () => {
    const mockResults = [
      { id: "i1", interaction_type: "meeting", similarity: 0.9 },
      { id: "i2", interaction_type: "email", similarity: 0.8 },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchInteractionsTool } = await import("@/lib/ai/tools");
    const result = await searchInteractionsTool.execute(
      { query: "test", interaction_type: "meeting", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect((result as { count: number }).count).toBe(1);
  });

  it("filters by direction", async () => {
    const mockResults = [
      { id: "i1", direction: "inbound", similarity: 0.9 },
      { id: "i2", direction: "outbound", similarity: 0.8 },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const { searchInteractionsTool } = await import("@/lib/ai/tools");
    const result = await searchInteractionsTool.execute(
      { query: "test", direction: "inbound", limit: 10 },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect((result as { count: number }).count).toBe(1);
  });
});

describe("getPersonDetailsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns person with related data", async () => {
    const person = {
      id: VALID_UUID,
      first_name: "Alice",
      last_name: "Smith",
      person_companies: [],
      person_tags: [],
      social_profiles: [],
      notes: [],
    };

    const interactionLinks = [
      { interactions: { id: "i1", interaction_type: "meeting", subject: "Catch up", occurred_at: "2026-01-01" } },
    ];

    // First call: from("people")
    const peopleBuilder = createMockQueryBuilder({ data: person, error: null });
    // Second call: from("interaction_people")
    const ipBuilder = createMockQueryBuilder({ data: interactionLinks, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "people") return peopleBuilder;
      if (table === "interaction_people") return ipBuilder;
      return createMockQueryBuilder({ data: null, error: null });
    });

    const { getPersonDetailsTool } = await import("@/lib/ai/tools");
    const result = await getPersonDetailsTool.execute(
      { person_id: VALID_UUID },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("person");
    expect(result).toHaveProperty("recent_interactions");
    expect((result as { person: { id: string } }).person.id).toBe(VALID_UUID);
  });

  it("returns error for non-existent person", async () => {
    const builder = createMockQueryBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(builder);

    const { getPersonDetailsTool } = await import("@/lib/ai/tools");
    const result = await getPersonDetailsTool.execute(
      { person_id: VALID_UUID },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("error", "Person not found");
  });

  it("enforces workspace isolation", async () => {
    const builder = createMockQueryBuilder({ data: { id: VALID_UUID }, error: null });
    const ipBuilder = createMockQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "people") return builder;
      return ipBuilder;
    });

    const { getPersonDetailsTool } = await import("@/lib/ai/tools");
    await getPersonDetailsTool.execute(
      { person_id: VALID_UUID },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    // Verify workspace_id filter was applied
    expect(builder.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
  });
});

describe("getRelationshipInsightsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns insights for a person", async () => {
    const person = {
      id: VALID_UUID,
      first_name: "Alice",
      last_name: "Smith",
      relationship_type: "colleague",
      relationship_strength: 0.8,
      last_contacted_at: "2026-01-01",
    };

    const interactions = [
      { interactions: { id: "i1", interaction_type: "meeting", occurred_at: "2026-01-15", direction: "outbound" } },
      { interactions: { id: "i2", interaction_type: "email", occurred_at: "2026-01-10", direction: "outbound" } },
      { interactions: { id: "i3", interaction_type: "meeting", occurred_at: "2026-01-05", direction: "inbound" } },
    ];

    const personBuilder = createMockQueryBuilder({ data: person, error: null });
    const ipBuilder = createMockQueryBuilder({ data: interactions, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "people") return personBuilder;
      if (table === "interaction_people") return ipBuilder;
      return createMockQueryBuilder({ data: null, error: null });
    });

    const { getRelationshipInsightsTool } = await import("@/lib/ai/tools");
    const result = await getRelationshipInsightsTool.execute(
      { person_id: VALID_UUID },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("person");
    expect(result).toHaveProperty("insights");
    const insights = (result as { insights: { total_interactions: number; interaction_types: Record<string, number> } }).insights;
    expect(insights.total_interactions).toBe(3);
    expect(insights.interaction_types.meeting).toBe(2);
    expect(insights.interaction_types.email).toBe(1);
  });

  it("returns insights for a company", async () => {
    const company = { id: "c1", name: "Acme Corp", industry: "Tech", location: "SF" };
    const people = [
      { people: { id: "p1", first_name: "Alice", last_name: "Smith", relationship_strength: 0.8, last_contacted_at: "2026-01-01" } },
    ];

    const companyBuilder = createMockQueryBuilder({ data: company, error: null });
    const pcBuilder = createMockQueryBuilder({ data: people, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "companies") return companyBuilder;
      if (table === "person_companies") return pcBuilder;
      return createMockQueryBuilder({ data: null, error: null });
    });

    const { getRelationshipInsightsTool } = await import("@/lib/ai/tools");
    const result = await getRelationshipInsightsTool.execute(
      { company_name: "Acme" },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("company");
    expect(result).toHaveProperty("people_count", 1);
  });

  it("returns error when neither person_id nor company_name provided", async () => {
    const { getRelationshipInsightsTool } = await import("@/lib/ai/tools");
    const result = await getRelationshipInsightsTool.execute(
      {},
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("person_id or company_name");
  });
});

describe("createNoteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a note for a person", async () => {
    const note = { id: "n1", content: "Important note", person_id: VALID_UUID, workspace_id: WORKSPACE_ID };
    const builder = createMockQueryBuilder({ data: note, error: null });
    mockFrom.mockReturnValue(builder);

    const { createNoteTool } = await import("@/lib/ai/tools");
    const result = await createNoteTool.execute(
      { person_id: VALID_UUID, content: "Important note" },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("note");
    expect(mockFrom).toHaveBeenCalledWith("notes");
    expect(builder.insert).toHaveBeenCalledWith({
      content: "Important note",
      workspace_id: WORKSPACE_ID,
      person_id: VALID_UUID,
    });
  });

  it("creates a note for a company", async () => {
    const note = { id: "n2", content: "Company note", company_id: VALID_UUID, workspace_id: WORKSPACE_ID };
    const builder = createMockQueryBuilder({ data: note, error: null });
    mockFrom.mockReturnValue(builder);

    const { createNoteTool } = await import("@/lib/ai/tools");
    const result = await createNoteTool.execute(
      { company_id: VALID_UUID, content: "Company note" },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("success", true);
    expect(builder.insert).toHaveBeenCalledWith({
      content: "Company note",
      workspace_id: WORKSPACE_ID,
      company_id: VALID_UUID,
    });
  });

  it("returns error on database failure", async () => {
    const builder = createMockQueryBuilder({ data: null, error: { message: "Insert failed" } });
    mockFrom.mockReturnValue(builder);

    const { createNoteTool } = await import("@/lib/ai/tools");
    const result = await createNoteTool.execute(
      { content: "Test note" },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Insert failed");
  });

  it("includes workspace_id in insert", async () => {
    const builder = createMockQueryBuilder({ data: { id: "n1" }, error: null });
    mockFrom.mockReturnValue(builder);

    const { createNoteTool } = await import("@/lib/ai/tools");
    await createNoteTool.execute(
      { content: "Test" },
      { toolCallId: "tc1", messages: [], experimental_context: toolContext() }
    );

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID })
    );
  });
});

describe("openfolioTools registry", () => {
  it("exports all tools", async () => {
    const { openfolioTools } = await import("@/lib/ai/tools");
    expect(openfolioTools).toHaveProperty("getSchema");
    expect(openfolioTools).toHaveProperty("executeSql");
    expect(openfolioTools).toHaveProperty("searchPeople");
    expect(openfolioTools).toHaveProperty("searchCompanies");
    expect(openfolioTools).toHaveProperty("searchInteractions");
    expect(openfolioTools).toHaveProperty("getPersonDetails");
    expect(openfolioTools).toHaveProperty("getRelationshipInsights");
    expect(openfolioTools).toHaveProperty("createNote");
  });
});
