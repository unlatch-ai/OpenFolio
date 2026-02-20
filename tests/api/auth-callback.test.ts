import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateServerClient = vi.fn();
const mockAdminFromMaybeSingle = vi.fn();
const mockEnsureProfile = vi.fn().mockResolvedValue(undefined);
const mockEnsurePersonalWorkspace = vi.fn().mockResolvedValue(undefined);

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, ReturnType<typeof vi.fn>> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.is = vi.fn().mockReturnValue(builder);
      builder.gt = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = mockAdminFromMaybeSingle;
      builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
      builder.insert = vi.fn().mockResolvedValue({ data: null, error: null });
      builder.update = vi.fn().mockReturnValue(builder);
      builder.in = vi.fn().mockResolvedValue({ data: null, error: null });
      builder.then = vi.fn((resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null })
      );
      return builder;
    },
  }),
}));

vi.mock("@/lib/workspaces/provision", () => ({
  ensureProfile: (...args: unknown[]) => mockEnsureProfile(...args),
  ensurePersonalWorkspace: (...args: unknown[]) =>
    mockEnsurePersonalWorkspace(...args),
}));

import { GET } from "@/app/auth/callback/route";

type SupabaseMocks = {
  exchangeCodeForSession: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function buildSupabaseClient({
  membership,
}: {
  membership: { id: string } | null;
}): SupabaseMocks {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership });

  mockCreateServerClient.mockReturnValue({
    auth: {
      exchangeCodeForSession,
      getUser,
      signOut,
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

  return { exchangeCodeForSession, getUser, signOut, maybeSingle };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.OPENFOLIO_DEPLOYMENT_MODE = "hosted";
    process.env.OPENFOLIO_AUTH_MODE = "supabase";
    process.env.OPENFOLIO_HOSTED_SIGNUP_MODE = "open";
    mockAdminFromMaybeSingle.mockResolvedValue({ data: null });
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

  it("redirects to login with invite_required in hosted invite-only mode", async () => {
    process.env.OPENFOLIO_HOSTED_SIGNUP_MODE = "invite-only";
    buildSupabaseClient({ membership: null });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=abc");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=invite_required"
    );
  });
});
