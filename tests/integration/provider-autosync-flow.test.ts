import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type IntegrationRow = {
  id: string;
  workspace_id: string;
  provider: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string;
  account_email: string | null;
  account_name: string | null;
  auto_sync_enabled: boolean;
  auto_sync_time_local: string;
  auto_sync_timezone: string | null;
  sync_cursor: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const db = {
  integrations: [] as IntegrationRow[],
  workspaces: [{ id: "ws-1", settings: { timezone: "UTC" } }],
};

let idSeq = 1;
const nextId = () => `int-${idSeq++}`;

function matchesFilters(
  row: Record<string, unknown>,
  filters: Array<{ key: string; value: unknown }>
) {
  return filters.every((f) => row[f.key] === f.value);
}

function createIntegrationsBuilder() {
  const filters: Array<{ key: string; value: unknown }> = [];
  let selectedColumns: string | null = null;
  let updatePayload: Record<string, unknown> | null = null;
  let upsertedId: string | null = null;

  const builder: Record<string, unknown> = {};

  builder.select = vi.fn((columns?: string) => {
    selectedColumns = columns || null;
    return builder;
  });

  builder.eq = vi.fn((key: string, value: unknown) => {
    filters.push({ key, value });
    return builder;
  });

  builder.upsert = vi.fn(
    (row: Record<string, unknown>, options?: { onConflict?: string }) => {
      if (options?.onConflict !== "workspace_id,provider") {
        throw new Error("Unexpected onConflict");
      }

      const existingIndex = db.integrations.findIndex(
        (r) => r.workspace_id === row.workspace_id && r.provider === row.provider
      );

      const merged: IntegrationRow = {
        id: existingIndex >= 0 ? db.integrations[existingIndex].id : nextId(),
        workspace_id: String(row.workspace_id),
        provider: String(row.provider),
        access_token_encrypted: (row.access_token_encrypted as string | null) ?? null,
        refresh_token_encrypted: (row.refresh_token_encrypted as string | null) ?? null,
        token_expires_at: (row.token_expires_at as string | null) ?? null,
        status: String(row.status || "active"),
        account_email: (row.account_email as string | null) ?? null,
        account_name: (row.account_name as string | null) ?? null,
        auto_sync_enabled:
          existingIndex >= 0 ? db.integrations[existingIndex].auto_sync_enabled : false,
        auto_sync_time_local:
          existingIndex >= 0 ? db.integrations[existingIndex].auto_sync_time_local : "02:00:00",
        auto_sync_timezone:
          existingIndex >= 0 ? db.integrations[existingIndex].auto_sync_timezone : null,
        sync_cursor: existingIndex >= 0 ? db.integrations[existingIndex].sync_cursor : {},
        metadata: existingIndex >= 0 ? db.integrations[existingIndex].metadata : {},
      };

      if (existingIndex >= 0) {
        db.integrations[existingIndex] = merged;
      } else {
        db.integrations.push(merged);
      }

      upsertedId = merged.id;
      return builder;
    }
  );

  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayload = payload;
    return builder;
  });

  builder.single = vi.fn(async () => {
    const target =
      (filters.length > 0
        ? db.integrations.find((row) => matchesFilters(row, filters))
        : null) ||
      (upsertedId
        ? db.integrations.find((row) => row.id === upsertedId)
        : undefined);

    if (!target) return { data: null, error: { code: "PGRST116" } };

    if (updatePayload) {
      Object.assign(target, updatePayload);
      // Merge metadata carefully
      if (updatePayload.metadata && typeof updatePayload.metadata === "object") {
        target.metadata = { ...target.metadata, ...(updatePayload.metadata as Record<string, unknown>) };
      }
    }

    if (selectedColumns) {
      const cols = selectedColumns.split(",").map((c) => c.trim()).filter(Boolean);
      const selected = cols.reduce((acc, key) => {
        acc[key] = (target as Record<string, unknown>)[key];
        return acc;
      }, {} as Record<string, unknown>);
      return { data: selected, error: null };
    }

    return { data: target, error: null };
  });

  builder.then = vi.fn((resolve: (value: unknown) => void) => {
    const rows = db.integrations.filter((row) => matchesFilters(row, filters));
    resolve({ data: rows, error: null });
  });

  return builder;
}

const triggerMock = vi.fn();
const upsertScheduleMock = vi.fn();
const deleteScheduleMock = vi.fn();
const googleHandleCallbackMock = vi.fn();
const microsoftHandleCallbackMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "integrations") return createIntegrationsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "integrations") return createIntegrationsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

vi.mock("@/lib/integrations/encryption", () => ({
  encrypt: (value: string) => `enc:${value}`,
}));

vi.mock("@/lib/integrations/registry", () => ({
  getConnector: (id: string) => {
    if (id === "gmail") return { handleCallback: googleHandleCallbackMock };
    if (id === "microsoft-mail") return { handleCallback: microsoftHandleCallbackMock };
    return undefined;
  },
}));

vi.mock("@/lib/auth", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
    workspaceId: "ws-1",
    workspaceRole: "owner",
  })),
  isWorkspaceContextError: vi.fn(() => false),
}));

vi.mock("@/lib/integrations/schedule", () => ({
  upsertIntegrationSchedule: (...args: unknown[]) => upsertScheduleMock(...args),
  deleteIntegrationSchedule: (...args: unknown[]) => deleteScheduleMock(...args),
}));

vi.mock("@trigger.dev/sdk", () => ({
  task: (params: unknown) => ({
    ...((params as Record<string, unknown>) || {}),
    trigger: (...args: unknown[]) => triggerMock(...args),
  }),
  schedules: {
    task: (params: unknown) => params,
  },
}));

vi.mock("@/src/trigger/sync-integration", () => ({
  syncIntegration: {
    trigger: (...args: unknown[]) => triggerMock(...args),
  },
}));

function signedState() {
  const payload = JSON.stringify({ workspaceId: "ws-1", userId: "user-1", ts: Date.now() });
  const sig = crypto
    .createHmac("sha256", process.env.OAUTH_STATE_SECRET as string)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

describe("Provider OAuth -> schedule lifecycle flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.integrations = [];
    idSeq = 1;

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    process.env.OAUTH_STATE_SECRET = "test-secret";

    googleHandleCallbackMock.mockResolvedValue({
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: new Date("2026-02-21T02:00:00Z"),
    });

    microsoftHandleCallbackMock.mockResolvedValue({
      accessToken: "ms-access",
      refreshToken: "ms-refresh",
      expiresAt: new Date("2026-02-21T02:00:00Z"),
    });

    triggerMock.mockResolvedValue({ id: "run-1" });
    upsertScheduleMock.mockResolvedValue("sched_test_123");
    deleteScheduleMock.mockResolvedValue(undefined);
  });

  it("Google callback: creates 3 integrations, creates a schedule per integration, triggers initial syncs", async () => {
    const state = signedState();
    const { GET: googleCallback } = await import(
      "@/app/api/integrations/google/callback/route"
    );

    const response = await googleCallback(
      new NextRequest(
        `http://localhost:3000/api/integrations/google/callback?code=abc&state=${state}`
      )
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/settings?success=google"
    );
    expect(db.integrations.map((i) => i.provider).sort()).toEqual([
      "gmail",
      "google-calendar",
      "google-contacts",
    ]);

    // One schedule created per integration
    expect(upsertScheduleMock).toHaveBeenCalledTimes(3);
    const scheduleIntegrationIds = upsertScheduleMock.mock.calls.map((c) => c[0]);
    expect(scheduleIntegrationIds.sort()).toEqual(
      db.integrations.map((i) => i.id).sort()
    );

    // One immediate sync triggered per integration
    expect(triggerMock).toHaveBeenCalledTimes(3);
  });

  it("Autosync enable: upserts schedule with correct time and timezone", async () => {
    // First create an integration
    db.integrations.push({
      id: "int-existing",
      workspace_id: "ws-1",
      provider: "gmail",
      access_token_encrypted: "enc:token",
      refresh_token_encrypted: null,
      token_expires_at: null,
      status: "active",
      account_email: null,
      account_name: null,
      auto_sync_enabled: false,
      auto_sync_time_local: "02:00:00",
      auto_sync_timezone: null,
      sync_cursor: {},
      metadata: {},
    });

    const { PATCH: patchAutosync } = await import(
      "@/app/api/integrations/[id]/autosync/route"
    );

    const response = await patchAutosync(
      new NextRequest("http://localhost:3000/api/integrations/int-existing/autosync", {
        method: "PATCH",
        headers: new Headers({ "content-type": "application/json", "x-workspace-id": "ws-1" }),
        body: JSON.stringify({
          autoSyncEnabled: true,
          autoSyncTimeLocal: "08:00",
          autoSyncTimezone: "America/New_York",
        }),
      }),
      { params: Promise.resolve({ id: "int-existing" }) }
    );

    expect(response.status).toBe(200);
    expect(upsertScheduleMock).toHaveBeenCalledWith(
      "int-existing",
      "08:00",
      "America/New_York"
    );
  });

  it("Autosync disable: deletes the existing schedule", async () => {
    db.integrations.push({
      id: "int-existing",
      workspace_id: "ws-1",
      provider: "gmail",
      access_token_encrypted: "enc:token",
      refresh_token_encrypted: null,
      token_expires_at: null,
      status: "active",
      account_email: null,
      account_name: null,
      auto_sync_enabled: true,
      auto_sync_time_local: "02:00:00",
      auto_sync_timezone: "UTC",
      sync_cursor: {},
      metadata: { trigger_schedule_id: "sched_existing" },
    });

    const { PATCH: patchAutosync } = await import(
      "@/app/api/integrations/[id]/autosync/route"
    );

    const response = await patchAutosync(
      new NextRequest("http://localhost:3000/api/integrations/int-existing/autosync", {
        method: "PATCH",
        headers: new Headers({ "content-type": "application/json", "x-workspace-id": "ws-1" }),
        body: JSON.stringify({ autoSyncEnabled: false }),
      }),
      { params: Promise.resolve({ id: "int-existing" }) }
    );

    expect(response.status).toBe(200);
    expect(upsertScheduleMock).not.toHaveBeenCalled();
    expect(deleteScheduleMock).toHaveBeenCalledWith("sched_existing");
  });

  it("Microsoft callback: creates 3 integrations with account info and schedules", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ displayName: "Ada Lovelace", mail: "ada@example.com" }),
        { status: 200 }
      )
    );

    const state = signedState();
    const { GET: microsoftCallback } = await import(
      "@/app/api/integrations/microsoft/callback/route"
    );

    const response = await microsoftCallback(
      new NextRequest(
        `http://localhost:3000/api/integrations/microsoft/callback?code=abc&state=${state}`
      )
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/settings?success=microsoft"
    );
    expect(db.integrations.map((i) => i.provider).sort()).toEqual([
      "microsoft-calendar",
      "microsoft-contacts",
      "microsoft-mail",
    ]);
    expect(db.integrations.every((i) => i.account_email === "ada@example.com")).toBe(true);
    expect(upsertScheduleMock).toHaveBeenCalledTimes(3);
    expect(triggerMock).toHaveBeenCalledTimes(3);
  });
});
