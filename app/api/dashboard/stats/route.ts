import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};

export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(request, {
      key: "dashboard:stats",
      limit: 60,
      windowMs: 60_000,
    });

    if (!limitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(limitResult.limit),
            "X-RateLimit-Remaining": String(limitResult.remaining),
            "X-RateLimit-Reset": String(limitResult.resetAt),
          },
        }
      );
    }

    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    const [peopleResult, companiesResult, interactionsResult] = await Promise.all([
      supabase
        .from("people")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId),
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId),
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId),
    ]);

    if (peopleResult.error || companiesResult.error || interactionsResult.error) {
      console.error(
        "Error fetching dashboard stats:",
        peopleResult.error || companiesResult.error || interactionsResult.error
      );
      return NextResponse.json(
        { error: "Failed to fetch stats" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        people: peopleResult.count ?? 0,
        companies: companiesResult.count ?? 0,
        interactions: interactionsResult.count ?? 0,
      },
      {
        headers: {
          ...CACHE_HEADERS,
          "X-RateLimit-Limit": String(limitResult.limit),
          "X-RateLimit-Remaining": String(limitResult.remaining),
          "X-RateLimit-Reset": String(limitResult.resetAt),
        },
      }
    );
  } catch (error) {
    console.error("Error in dashboard stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
