import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type IntegrationRow = {
  id: string;
  workspace_id: string;
  user_id: string;
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

function matchesFilters(row: Record<string, unknown>, filters: Array<{ key: string; value: unknown }>) {
  return filters.every((f) => row[f.key] === f.value);
}

function createIntegrationsBuilder() {
  const filters: Array<{ key: string; value: unknown }> = [];
  let selectedColumns: string | null = null;
  let updatePayload: Record<string, unknown> | null = null;

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
    async (
      row: Record<string, unknown>,
      options?: { onConflict?: string }
    ) => {
      if (options?.onConflict !== "workspace_id,provider") {
        return { data: null, error: { message: "Unexpected onConflict" } };
      }

      const existingIndex = db.integrations.findIndex(
        (r) =>
          r.workspace_id === row.workspace_id &&
          r.provider === row.provider
      );

      const merged: IntegrationRow = {
        id: existingIndex >= 0 ? db.integrations[existingIndex].id : nextId(),
        workspace_id: String(row.workspace_id),
        user_id: String(row.user_id),
        provider: String(row.provider),
        access_token_encrypted:
          (row.access_token_encrypted as string | null) ?? null,
        refresh_token_encrypted:
          (row.refresh_token_encrypted as string | null) ?? null,
        token_expires_at: (row.token_expires_at as string | null) ?? null,
        status: String(row.status || "active"),
        account_email: (row.account_email as string | null) ?? null,
        account_name: (row.account_name as string | null) ?? null,
        auto_sync_enabled:
          existingIndex >= 0
            ? db.integrations[existingIndex].auto_sync_enabled
            : false,
        auto_sync_time_local:
          existingIndex >= 0
            ? db.integrations[existingIndex].auto_sync_time_local
            : "02:00:00",
        auto_sync_timezone:
          existingIndex >= 0
            ? db.integrations[existingIndex].auto_sync_timezone
            : null,
        sync_cursor:
          existingIndex >= 0 ? db.integrations[existingIndex].sync_cursor : {},
        metadata: existingIndex >= 0 ? db.integrations[existingIndex].metadata : {},
      };

      if (existingIndex >= 0) {
        db.integrations[existingIndex] = merged;
      } else {
        db.integrations.push(merged);
      }

      return { data: merged, error: null };
    }
  );

  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayload = payload;
    return builder;
  });

  builder.single = vi.fn(async () => {
    const target = db.integrations.find((row) => matchesFilters(row, filters));
    if (!target) {
      return { data: null, error: { code: "PGRST116" } };
    }

    if (updatePayload) {
      Object.assign(target, updatePayload);
    }

    if (selectedColumns) {
      const selected = selectedColumns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .reduce((acc, key) => {
          acc[key] = (target as Record<string, unknown>)[key];
          return acc;
        }, {} as Record<string, unknown>);
      return { data: selected, error: null };
    }

    return { data: target, error: null };
  });

  builder.then = vi.fn((resolve: (value: unknown) => void) => {
    const rows = db.integrations
      .filter((row) => matchesFilters(row, filters))
      .map((row) => {
        if (selectedColumns?.includes("workspaces:workspace_id")) {
          const ws = db.workspaces.find((w) => w.id === row.workspace_id);
          return {
            ...row,
            workspaces: { settings: ws?.settings || {} },
          };
        }
        return row;
      });
    resolve({ data: rows, error: null });
  });

  return builder;
}

const triggerMock = vi.fn();
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

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (params: unknown) => params,
  },
  tasks: {
    trigger: (...args: unknown[]) => triggerMock(...args),
  },
}));

function signedState() {
  const payload = JSON.stringify({
    workspaceId: "ws-1",
    userId: "user-1",
    ts: Date.now(),
  });
  const sig = crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY as string)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

describe("Provider OAuth -> autosync -> scheduler flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.integrations = [];
    idSeq = 1;

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";

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
  });

  it("Google flow: callback creates integrations, autosync enables, scheduler triggers sync", async () => {
    const state = signedState();
    const { GET: googleCallback } = await import(
      "@/app/api/integrations/google/callback/route"
    );

    await googleCallback(
      new NextRequest(
        `http://localhost:3000/api/integrations/google/callback?code=abc&state=${state}`
      )
    );

    expect(db.integrations.map((i) => i.provider).sort()).toEqual([
      "gmail",
      "google-calendar",
      "google-contacts",
    ]);

    const target = db.integrations.find((i) => i.provider === "google-contacts");
    expect(target).toBeTruthy();

    const { PATCH: patchAutosync } = await import(
      "@/app/api/integrations/[id]/autosync/route"
    );

    await patchAutosync(
      new NextRequest(`http://localhost:3000/api/integrations/${target?.id}/autosync`, {
        method: "PATCH",
        headers: new Headers({
          "content-type": "application/json",
          "x-workspace-id": "ws-1",
        }),
        body: JSON.stringify({
          autoSyncEnabled: true,
          autoSyncTimeLocal: "02:00",
          autoSyncTimezone: "UTC",
        }),
      }),
      { params: Promise.resolve({ id: target!.id }) }
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T02:00:00Z"));

    const { scheduleIntegrationSyncs } = await import(
      "@/src/trigger/schedule-integration-syncs"
    );

    const result = await (
      scheduleIntegrationSyncs as unknown as {
        run: (payload: unknown) => Promise<{ triggered: number }>;
      }
    ).run({ type: "DECLARATIVE" });

    expect(result.triggered).toBe(1);
    expect(triggerMock).toHaveBeenCalledWith(
      "sync-integration",
      { integrationId: target!.id, workspaceId: "ws-1" },
      { idempotencyKey: `autosync:${target!.id}:2026-02-21` }
    );

    vi.useRealTimers();
  });

  it("Microsoft flow: callback creates integrations, autosync enables, scheduler triggers sync", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          displayName: "Ada Lovelace",
          mail: "ada@example.com",
          userPrincipalName: "ada@example.com",
        }),
        { status: 200 }
      )
    );

    const state = signedState();
    const { GET: microsoftCallback } = await import(
      "@/app/api/integrations/microsoft/callback/route"
    );

    await microsoftCallback(
      new NextRequest(
        `http://localhost:3000/api/integrations/microsoft/callback?code=abc&state=${state}`
      )
    );

    expect(db.integrations.map((i) => i.provider).sort()).toEqual([
      "microsoft-calendar",
      "microsoft-contacts",
      "microsoft-mail",
    ]);

    const target = db.integrations.find((i) => i.provider === "microsoft-contacts");
    expect(target?.account_email).toBe("ada@example.com");

    const { PATCH: patchAutosync } = await import(
      "@/app/api/integrations/[id]/autosync/route"
    );

    await patchAutosync(
      new NextRequest(`http://localhost:3000/api/integrations/${target?.id}/autosync`, {
        method: "PATCH",
        headers: new Headers({
          "content-type": "application/json",
          "x-workspace-id": "ws-1",
        }),
        body: JSON.stringify({
          autoSyncEnabled: true,
          autoSyncTimeLocal: "02:00",
          autoSyncTimezone: "UTC",
        }),
      }),
      { params: Promise.resolve({ id: target!.id }) }
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T02:00:00Z"));

    const { scheduleIntegrationSyncs } = await import(
      "@/src/trigger/schedule-integration-syncs"
    );

    const result = await (
      scheduleIntegrationSyncs as unknown as {
        run: (payload: unknown) => Promise<{ triggered: number }>;
      }
    ).run({ type: "DECLARATIVE" });

    expect(result.triggered).toBe(1);
    expect(triggerMock).toHaveBeenCalledWith(
      "sync-integration",
      { integrationId: target!.id, workspaceId: "ws-1" },
      { idempotencyKey: `autosync:${target!.id}:2026-02-21` }
    );

    vi.useRealTimers();
  });
});
