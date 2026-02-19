import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateServerClient = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

import { GET } from "@/app/auth/callback/route";

type SupabaseMocks = {
  exchangeCodeForSession: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function buildSupabaseClient({
  membership,
}: {
  membership: { id: string } | null;
}): SupabaseMocks {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } });
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership });

  mockCreateServerClient.mockReturnValue({
    auth: {
      exchangeCodeForSession,
      getUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle,
          }),
        }),
      }),
    }),
  });

  return { exchangeCodeForSession, getUser, maybeSingle };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.OPENFOLIO_DEPLOYMENT_MODE = "hosted";
    process.env.OPENFOLIO_AUTH_MODE = "supabase";
  });

  it("redirects to /login when code is missing", async () => {
    const request = new NextRequest("http://localhost:3000/auth/callback");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("honors redirectTo when provided", async () => {
    buildSupabaseClient({ membership: null });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=abc&redirectTo=%2Finvite%3Ftoken%3D123"
    );
    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/invite?token=123"
    );
  });

  it("redirects existing members to /app", async () => {
    buildSupabaseClient({ membership: { id: "m1" } });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=abc");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("redirects new users to /app after auto-provision", async () => {
    buildSupabaseClient({ membership: null });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=abc");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  });
});
