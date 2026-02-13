import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type WaitlistTableResponse = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

const mockAdminClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

function mockTableResponse(data: unknown): WaitlistTableResponse {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new entry when none exists", async () => {
    const table = mockTableResponse(null);
    table.insert = vi.fn().mockReturnThis();
    table.single = vi.fn().mockResolvedValue({
      data: { id: "1", name: "Alex", email: "alex@test.com", status: "pending" },
      error: null,
    });

    mockAdminClient.from.mockReturnValue(table);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ name: "Alex", email: "alex@test.com" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.entry.email).toBe("alex@test.com");
    expect(json.created).toBe(true);
  });

  it("returns existing entry when already present", async () => {
    const table = mockTableResponse({
      id: "1",
      name: "Alex",
      email: "alex@test.com",
      status: "pending",
    });

    mockAdminClient.from.mockReturnValue(table);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ name: "Alex", email: "alex@test.com" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.created).toBe(false);
    expect(json.entry.email).toBe("alex@test.com");
  });
});
