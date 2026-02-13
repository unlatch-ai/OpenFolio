import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { decodeCursor, encodeCursor, formatFilterValue } from "@/lib/pagination";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};
const SORTABLE_FIELDS = new Set(["created_at", "occurred_at", "interaction_type"]);

const createInteractionSchema = z.object({
  interaction_type: z.string().min(1, "Interaction type is required"),
  occurred_at: z.string().datetime(),
  direction: z.string().optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  participant_ids: z.array(z.string().uuid()).optional(),
});

// GET /api/interactions - List interactions with cursor pagination
export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(request, {
      key: "interactions:list",
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
    const { searchParams } = request.nextUrl;
    const limitParam = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const interactionType = searchParams.get("interaction_type");
    const personId = searchParams.get("person_id");
    const direction = searchParams.get("direction");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const sortParam = searchParams.get("sort") ?? "occurred_at";
    const dirParam = searchParams.get("dir") ?? "desc";
    const sort = SORTABLE_FIELDS.has(sortParam) ? sortParam : "occurred_at";
    const dir = dirParam === "asc" ? "asc" : "desc";
    const cursor = decodeCursor(searchParams.get("cursor"));

    let query = supabase
      .from("interactions")
      .select(`
        *,
        interaction_people(*, people(id, first_name, last_name, email, avatar_url))
      `)
      .eq("workspace_id", ctx.workspaceId);

    if (interactionType) {
      query = query.eq("interaction_type", interactionType);
    }
    if (direction) {
      query = query.eq("direction", direction);
    }
    if (dateFrom) {
      query = query.gte("occurred_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("occurred_at", dateTo);
    }

    query = query
      .order(sort, { ascending: dir === "asc" })
      .order("id", { ascending: dir === "asc" });

    const cursorConditions: string[] = [];
    if (cursor && cursor.sort === sort && cursor.dir === dir) {
      const op = dir === "asc" ? "gt" : "lt";
      if (cursor.value === null || cursor.value === undefined) {
        const idValue = formatFilterValue(cursor.id);
        cursorConditions.push(`and(${sort}.is.null,id.${op}.${idValue})`);
      } else {
        const value = formatFilterValue(cursor.value);
        const idValue = formatFilterValue(cursor.id);
        cursorConditions.push(`${sort}.${op}.${value}`);
        cursorConditions.push(`and(${sort}.eq.${value},id.${op}.${idValue})`);
      }
    }

    if (cursorConditions.length > 0) {
      query = query.or(cursorConditions.join(","));
    }

    const { data: interactions, error } = await query.limit(limit + 1);

    if (error) {
      console.error("Error fetching interactions:", error);
      return NextResponse.json(
        { error: "Failed to fetch interactions" },
        { status: 500 }
      );
    }

    const rows = interactions || [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeCursor({
          sort,
          dir,
          value: (lastRow as Record<string, unknown>)[sort] ?? null,
          id: lastRow.id,
        })
      : null;

    // Post-query filtering for person_id (joined data)
    let filtered = page;
    if (personId) {
      filtered = filtered.filter((i) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (i as any).interaction_people?.some((ip: any) => ip.person_id === personId)
      );
    }

    return NextResponse.json(
      {
        data: filtered,
        limit,
        hasMore,
        nextCursor,
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
    console.error("Error in interactions API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/interactions - Create a new interaction
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = createInteractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { participant_ids, ...interactionData } = parsed.data;

    const { data, error } = await supabase
      .from("interactions")
      .insert({
        ...interactionData,
        workspace_id: ctx.workspaceId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating interaction:", error);
      return NextResponse.json(
        { error: "Failed to create interaction" },
        { status: 500 }
      );
    }

    // Insert interaction_people rows for each participant (validate workspace ownership)
    if (participant_ids && participant_ids.length > 0) {
      const { data: validPeople } = await supabase
        .from("people")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .in("id", participant_ids);

      const validIds = new Set((validPeople || []).map((p) => p.id));
      const interactionPeopleRows = participant_ids
        .filter((personId) => validIds.has(personId))
        .map((personId) => ({
          interaction_id: data.id,
          person_id: personId,
          workspace_id: ctx.workspaceId,
          role: "participant",
        }));

      const { error: participantsError } = interactionPeopleRows.length > 0
        ? await supabase.from("interaction_people").insert(interactionPeopleRows)
        : { error: null };

      if (participantsError) {
        console.error("Error linking participants:", participantsError);
        // Don't fail the whole request — interaction was created
      }
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "interaction",
      entityId: data.id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in interactions API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
