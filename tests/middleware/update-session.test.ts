import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateServerClient = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

import { updateSession } from "@/lib/supabase/middleware";

describe("updateSession middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENFOLIO_DEPLOYMENT_MODE = "hosted";
    process.env.OPENFOLIO_AUTH_MODE = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });

  it("redirects authenticated users from root to /app", async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
        }),
      },
    });

    const request = new NextRequest("http://localhost:3000/");
    const response = await updateSession(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
    expect(response.status).toBe(307);
  });

  it("does not redirect unauthenticated users from root", async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    });

    const request = new NextRequest("http://localhost:3000/");
    const response = await updateSession(request);

    expect(response.headers.get("location")).toBeNull();
  });
});
