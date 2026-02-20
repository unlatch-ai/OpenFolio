/**
 * Integration Gateway Tests
 *
 * Tests the registry, encryption, and gateway pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "crypto";

// --- Mocks ---

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

// --- Registry Tests ---

describe("Integration Registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers and retrieves a connector", async () => {
    const { registerConnector, getConnector } = await import(
      "@/lib/integrations/registry"
    );

    const mockConnector = {
      id: "test",
      name: "Test Connector",
      description: "A test connector",
      icon: "plug",
      auth: "none" as const,
      sync: vi.fn(),
    };

    registerConnector(mockConnector);
    expect(getConnector("test")).toBe(mockConnector);
  });

  it("returns undefined for unregistered connector", async () => {
    const { getConnector } = await import("@/lib/integrations/registry");
    expect(getConnector("nonexistent")).toBeUndefined();
  });

  it("lists all registered connectors", async () => {
    const { registerConnector, listConnectors } = await import(
      "@/lib/integrations/registry"
    );

    registerConnector({
      id: "a",
      name: "A",
      description: "",
      icon: "",
      auth: "none" as const,
      sync: vi.fn(),
    });
    registerConnector({
      id: "b",
      name: "B",
      description: "",
      icon: "",
      auth: "none" as const,
      sync: vi.fn(),
    });

    const list = listConnectors();
    // Includes built-in csv connector + a + b
    expect(list.map((c) => c.id)).toContain("csv");
    expect(list.map((c) => c.id)).toContain("microsoft-mail");
    expect(list.map((c) => c.id)).toContain("microsoft-calendar");
    expect(list.map((c) => c.id)).toContain("microsoft-contacts");
    expect(list.map((c) => c.id)).toContain("a");
    expect(list.map((c) => c.id)).toContain("b");
  });
});

// --- Encryption Tests ---

describe("Encryption", () => {
  const TEST_KEY = randomBytes(32).toString("hex");

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = TEST_KEY;
  });

  it("encrypts and decrypts a string", async () => {
    const { encrypt, decrypt } = await import(
      "@/lib/integrations/encryption"
    );

    const plaintext = "my-secret-token-12345";
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":");

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext", async () => {
    const { encrypt } = await import("@/lib/integrations/encryption");

    const a = encrypt("same-text");
    const b = encrypt("same-text");

    expect(a).not.toBe(b);
  });

  it("handles empty strings", async () => {
    const { encrypt, decrypt } = await import(
      "@/lib/integrations/encryption"
    );

    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode characters", async () => {
    const { encrypt, decrypt } = await import(
      "@/lib/integrations/encryption"
    );

    const plaintext = "Hello 🌍 café résumé";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});

// --- Gateway Pipeline Tests ---

describe("Gateway processSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createQueryBuilder(resolvedValue: {
    data: unknown;
    error: unknown;
  }) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.insert = vi.fn().mockReturnValue(builder);
    builder.update = vi.fn().mockReturnValue(builder);
    builder.upsert = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.contains = vi.fn().mockReturnValue(builder);
    builder.single = vi.fn().mockResolvedValue(resolvedValue);
    builder.then = vi.fn((resolve: (v: unknown) => unknown) =>
      resolve(resolvedValue)
    );
    return builder;
  }

  it("creates people and returns correct summary", async () => {
    // Person lookup (no existing) then insert
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "people" && callCount === 1) {
        // Email dedup check — not found
        return createQueryBuilder({
          data: null,
          error: { code: "PGRST116" },
        });
      }
      if (table === "people" && callCount === 2) {
        // Insert new person
        return createQueryBuilder({
          data: { id: "p-new-1" },
          error: null,
        });
      }
      return createQueryBuilder({ data: null, error: null });
    });

    const { processSync } = await import("@/lib/integrations/gateway");

    const result = await processSync(
      {
        people: [
          {
            email: "alice@test.com",
            first_name: "Alice",
            last_name: "Smith",
            source: "csv",
          },
        ],
        interactions: [],
        cursor: null,
        hasMore: false,
      },
      "ws-123"
    );

    expect(result.peopleCreated).toBe(1);
    expect(result.peopleUpdated).toBe(0);
  });

  it("updates existing people (dedup by email)", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "people" && callCount === 1) {
        // Found existing person
        return createQueryBuilder({
          data: { id: "p-existing" },
          error: null,
        });
      }
      if (table === "people" && callCount === 2) {
        // Update
        return createQueryBuilder({ data: null, error: null });
      }
      return createQueryBuilder({ data: null, error: null });
    });

    const { processSync } = await import("@/lib/integrations/gateway");

    const result = await processSync(
      {
        people: [
          {
            email: "existing@test.com",
            first_name: "Updated",
            source: "csv",
          },
        ],
        interactions: [],
        cursor: null,
        hasMore: false,
      },
      "ws-123"
    );

    expect(result.peopleCreated).toBe(0);
    expect(result.peopleUpdated).toBe(1);
  });

  it("auto-creates companies from person data", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "people" && callCount === 1) {
        // No existing person
        return createQueryBuilder({
          data: null,
          error: { code: "PGRST116" },
        });
      }
      if (table === "people" && callCount === 2) {
        // Insert person
        return createQueryBuilder({
          data: { id: "p-new" },
          error: null,
        });
      }
      if (table === "companies" && callCount === 3) {
        // No existing company
        return createQueryBuilder({
          data: null,
          error: { code: "PGRST116" },
        });
      }
      if (table === "companies" && callCount === 4) {
        // Insert company
        return createQueryBuilder({
          data: { id: "c-new" },
          error: null,
        });
      }
      if (table === "person_companies") {
        return createQueryBuilder({ data: null, error: null });
      }
      return createQueryBuilder({ data: null, error: null });
    });

    const { processSync } = await import("@/lib/integrations/gateway");

    const result = await processSync(
      {
        people: [
          {
            email: "alice@acme.com",
            first_name: "Alice",
            company_name: "Acme Corp",
            company_domain: "acme.com",
            source: "csv",
          },
        ],
        interactions: [],
        cursor: null,
        hasMore: false,
      },
      "ws-123"
    );

    expect(result.companiesCreated).toBe(1);
  });

  it("creates interactions and links participants", async () => {
    // We need the emailMap to be populated first
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "people" && callCount === 1) {
        // No existing
        return createQueryBuilder({
          data: null,
          error: { code: "PGRST116" },
        });
      }
      if (table === "people" && callCount === 2) {
        // Insert person
        return createQueryBuilder({
          data: { id: "p1" },
          error: null,
        });
      }
      if (table === "interactions" && callCount === 3) {
        // Source dedup check - not found
        return createQueryBuilder({
          data: null,
          error: { code: "PGRST116" },
        });
      }
      if (table === "interactions" && callCount === 4) {
        // Insert interaction
        return createQueryBuilder({
          data: { id: "i1" },
          error: null,
        });
      }
      if (table === "interaction_people") {
        return createQueryBuilder({ data: null, error: null });
      }
      return createQueryBuilder({ data: null, error: null });
    });

    const { processSync } = await import("@/lib/integrations/gateway");

    const result = await processSync(
      {
        people: [
          {
            email: "alice@test.com",
            first_name: "Alice",
            source: "gmail",
          },
        ],
        interactions: [
          {
            interaction_type: "email",
            subject: "Hello",
            occurred_at: "2026-01-15T10:00:00Z",
            participant_emails: ["alice@test.com"],
            source: "gmail",
            source_id: "msg-123",
          },
        ],
        cursor: null,
        hasMore: false,
      },
      "ws-123"
    );

    expect(result.interactionsCreated).toBe(1);
  });

  it("handles empty sync results", async () => {
    const { processSync } = await import("@/lib/integrations/gateway");

    const result = await processSync(
      {
        people: [],
        interactions: [],
        cursor: null,
        hasMore: false,
      },
      "ws-123"
    );

    expect(result.peopleCreated).toBe(0);
    expect(result.peopleUpdated).toBe(0);
    expect(result.companiesCreated).toBe(0);
    expect(result.interactionsCreated).toBe(0);
  });
});

// --- CSV Connector Tests ---

describe("CSV Connector", () => {
  it("parses a basic CSV file", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `first_name,last_name,email,company
Alice,Smith,alice@example.com,Acme
Bob,Jones,bob@example.com,Widgets`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "test.csv"
    );

    expect(result.people).toHaveLength(2);
    expect(result.people[0].first_name).toBe("Alice");
    expect(result.people[0].last_name).toBe("Smith");
    expect(result.people[0].email).toBe("alice@example.com");
    expect(result.people[0].company_name).toBe("Acme");
    expect(result.people[1].first_name).toBe("Bob");
  });

  it("detects LinkedIn export format", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `First Name,Last Name,Email Address,Company,Position,Connected On
Alice,Smith,alice@example.com,Acme,Engineer,15 Jan 2024`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "linkedin.csv"
    );

    expect(result.people).toHaveLength(1);
    expect(result.people[0].first_name).toBe("Alice");
    expect(result.people[0].job_title).toBe("Engineer");
  });

  it("handles quoted CSV fields", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `name,email,notes
"Smith, Alice",alice@example.com,"She said ""hello""."`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "test.csv"
    );

    expect(result.people).toHaveLength(1);
    expect(result.people[0].display_name).toBe("Smith, Alice");
  });

  it("skips rows without identifying info", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `first_name,email,company
Alice,alice@example.com,Acme
,,
,,Orphan Corp`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "test.csv"
    );

    expect(result.people).toHaveLength(1);
  });

  it("returns empty for single-line CSV", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `first_name,email`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "test.csv"
    );

    expect(result.people).toHaveLength(0);
  });

  it("splits display_name into first/last when not provided", async () => {
    const { csvConnector } = await import(
      "@/lib/integrations/connectors/csv"
    );

    const csv = `full name,email
Alice Smith,alice@example.com
Bob,bob@example.com`;

    const result = await csvConnector.parseFile!(
      Buffer.from(csv),
      "test.csv"
    );

    expect(result.people[0].first_name).toBe("Alice");
    expect(result.people[0].last_name).toBe("Smith");
    expect(result.people[1].first_name).toBe("Bob");
  });
});

describe("Microsoft Connectors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("microsoft callback stores encrypted tokens shape", async () => {
    const { microsoftMailConnector } = await import(
      "@/lib/integrations/connectors/microsoft-mail"
    );

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
        { status: 200 }
      )
    );

    const result = await microsoftMailConnector.handleCallback!("auth-code", "https://example.com/api/integrations/microsoft/callback");
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("falls back to full sync when contacts delta token is invalid", async () => {
    const { microsoftContactsConnector } = await import(
      "@/lib/integrations/connectors/microsoft-contacts"
    );

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "SyncStateNotFound", message: "Delta token expired" },
          }),
          { status: 410 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [],
            "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/contacts/delta?$deltatoken=abc",
          }),
          { status: 200 }
        )
      );

    const result = await microsoftContactsConnector.sync({
      accessToken: "token",
      cursor: { contactsDeltaLink: "stale-link" },
      workspaceId: "ws-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.cursor).toEqual({
      contactsDeltaLink:
        "https://graph.microsoft.com/v1.0/me/contacts/delta?$deltatoken=abc",
    });
  });
});

// --- Types Tests ---

describe("Integration Types", () => {
  it("NormalizedPerson has expected shape", async () => {
    const { } = await import("@/lib/integrations/types");

    // Type-level test — if this compiles, the types exist
    const person: import("@/lib/integrations/types").NormalizedPerson = {
      email: "test@example.com",
      first_name: "Test",
      source: "csv",
    };
    expect(person.source).toBe("csv");
  });

  it("SyncResult has expected shape", async () => {
    const syncResult: import("@/lib/integrations/types").SyncResult = {
      people: [],
      interactions: [],
      cursor: null,
      hasMore: false,
    };
    expect(syncResult.hasMore).toBe(false);
  });
});
