import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockHandleCallback = vi.fn();
const mockGetConnector = vi.fn(() => ({ handleCallback: mockHandleCallback }));

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));

vi.mock("@/lib/integrations/registry", () => ({
  getConnector: mockGetConnector,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/integrations/encryption", () => ({
  encrypt: (value: string) => `enc:${value}`,
}));

function createSignedState(payload: Record<string, unknown>, secret: string) {
  const payloadText = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(payloadText).digest("hex");
  return `${Buffer.from(payloadText).toString("base64url")}.${sig}`;
}

describe("Integration OAuth callbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";

    mockHandleCallback.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2026-02-20T12:00:00Z"),
    });
  });

  it("Google callback upserts gmail/calendar/contacts with workspace-provider conflict", async () => {
    const state = createSignedState(
      {
        workspaceId: "ws-1",
        userId: "user-1",
        ts: Date.now(),
      },
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { GET } = await import("@/app/api/integrations/google/callback/route");
    const request = new NextRequest(
      `http://localhost:3000/api/integrations/google/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/settings/integrations?success=google"
    );

    expect(mockUpsert).toHaveBeenCalledTimes(3);
    const providers = mockUpsert.mock.calls.map((call) => call[0].provider);
    expect(providers).toEqual(["gmail", "google-calendar", "google-contacts"]);
    for (const call of mockUpsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: "workspace_id,provider" });
    }
  });

  it("Microsoft callback upserts mail/calendar/contacts and stores account info", async () => {
    const state = createSignedState(
      {
        workspaceId: "ws-1",
        userId: "user-1",
        ts: Date.now(),
      },
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          displayName: "Ada Lovelace",
          userPrincipalName: "ada@example.com",
          mail: "ada@example.com",
        }),
        { status: 200 }
      )
    );

    const { GET } = await import("@/app/api/integrations/microsoft/callback/route");
    const request = new NextRequest(
      `http://localhost:3000/api/integrations/microsoft/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/settings/integrations?success=microsoft"
    );

    expect(mockUpsert).toHaveBeenCalledTimes(3);
    const providers = mockUpsert.mock.calls.map((call) => call[0].provider);
    expect(providers).toEqual([
      "microsoft-mail",
      "microsoft-calendar",
      "microsoft-contacts",
    ]);

    for (const call of mockUpsert.mock.calls) {
      expect(call[0].account_email).toBe("ada@example.com");
      expect(call[0].account_name).toBe("Ada Lovelace");
      expect(call[1]).toEqual({ onConflict: "workspace_id,provider" });
    }
  });
});
