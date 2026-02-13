import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/openai";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  entity_types: z.array(z.enum(["people", "companies", "interactions", "notes"])).optional(),
  limit: z.number().min(1).max(50).default(20),
  threshold: z.number().min(0).max(1).default(0.3),
});

export async function POST(request: NextRequest) {
  try {
    const limitResult = rateLimit(request, {
      key: "search",
      limit: 30,
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

    const body = await request.json();
    const parsed = searchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { query, entity_types, limit, threshold } = parsed.data;
    const types = entity_types || ["people", "companies", "interactions"];

    // Generate query embedding
    const embedding = await generateEmbedding(query);
    const supabase = createAdminClient();

    const results: Array<{ type: string; data: unknown; similarity: number }> = [];

    // Search each entity type in parallel
    const searches = [];

    if (types.includes("people")) {
      searches.push(
        supabase.rpc("match_people_text", {
          query_embedding: JSON.stringify(embedding),
          match_threshold: threshold,
          match_count: limit,
          p_workspace_id: ctx.workspaceId,
        }).then(({ data }) =>
          (data || []).forEach((r: { similarity: number }) =>
            results.push({ type: "person", data: r, similarity: r.similarity })
          )
        )
      );
    }

    if (types.includes("companies")) {
      searches.push(
        supabase.rpc("match_companies_text", {
          query_embedding: JSON.stringify(embedding),
          match_threshold: threshold,
          match_count: limit,
          p_workspace_id: ctx.workspaceId,
        }).then(({ data }) =>
          (data || []).forEach((r: { similarity: number }) =>
            results.push({ type: "company", data: r, similarity: r.similarity })
          )
        )
      );
    }

    if (types.includes("interactions")) {
      searches.push(
        supabase.rpc("match_interactions_text", {
          query_embedding: JSON.stringify(embedding),
          match_threshold: threshold,
          match_count: limit,
          p_workspace_id: ctx.workspaceId,
        }).then(({ data }) =>
          (data || []).forEach((r: { similarity: number }) =>
            results.push({ type: "interaction", data: r, similarity: r.similarity })
          )
        )
      );
    }

    if (types.includes("notes")) {
      searches.push(
        supabase.rpc("match_notes_text", {
          query_embedding: JSON.stringify(embedding),
          match_threshold: threshold,
          match_count: limit,
          p_workspace_id: ctx.workspaceId,
        }).then(({ data }) =>
          (data || []).forEach((r: { similarity: number }) =>
            results.push({ type: "note", data: r, similarity: r.similarity })
          )
        )
      );
    }

    await Promise.all(searches);

    // Sort by similarity descending, take top `limit`
    results.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json(
      { data: results.slice(0, limit) },
      {
        headers: {
          "X-RateLimit-Limit": String(limitResult.limit),
          "X-RateLimit-Remaining": String(limitResult.remaining),
          "X-RateLimit-Reset": String(limitResult.resetAt),
        },
      }
    );
  } catch (error) {
    console.error("Error in search:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
