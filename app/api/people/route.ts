import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { decodeCursor, encodeCursor, formatFilterValue } from "@/lib/pagination";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};
const SORTABLE_FIELDS = new Set(["created_at", "updated_at", "last_name", "first_name", "email", "last_contacted_at"]);
const NULLS_LAST_FIELDS = new Set(["last_name", "first_name", "last_contacted_at"]);

const createPersonSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  relationship_type: z.string().default("contact"),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/people - List people with cursor pagination
export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(request, {
      key: "people:list",
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
    const search = searchParams.get("search")?.trim();
    const tag = searchParams.get("tag");
    const companyId = searchParams.get("company_id");
    const relationshipType = searchParams.get("relationship_type");
    const sortParam = searchParams.get("sort") ?? "updated_at";
    const dirParam = searchParams.get("dir") ?? "desc";
    const sort = SORTABLE_FIELDS.has(sortParam) ? sortParam : "updated_at";
    const dir = dirParam === "asc" ? "asc" : "desc";
    const cursor = decodeCursor(searchParams.get("cursor"));

    let query = supabase
      .from("people")
      .select(`
        *,
        person_companies(company_id, role, is_current, companies(id, name)),
        person_tags(tags(id, name, color))
      `)
      .eq("workspace_id", ctx.workspaceId);

    if (relationshipType) {
      query = query.eq("relationship_type", relationshipType);
    }

    const nullsLast = NULLS_LAST_FIELDS.has(sort);
    query = query
      .order(sort, nullsLast ? { ascending: dir === "asc", nullsFirst: false } : { ascending: dir === "asc" })
      .order("id", { ascending: dir === "asc" });

    const searchConditions: string[] = [];
    if (search) {
      const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = formatFilterValue(`%${escapedSearch}%`);
      searchConditions.push(
        `email.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `display_name.ilike.${pattern}`
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (cursor?.id && !UUID_REGEX.test(cursor.id)) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

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
        if (nullsLast) {
          cursorConditions.push(`${sort}.is.null`);
        }
      }
    }

    if (searchConditions.length > 0 && cursorConditions.length > 0) {
      const cursorGroup =
        cursorConditions.length > 1
          ? `or(${cursorConditions.join(",")})`
          : cursorConditions[0];
      const combined = searchConditions.map((condition) => `and(${condition},${cursorGroup})`);
      query = query.or(combined.join(","));
    } else if (searchConditions.length > 0) {
      query = query.or(searchConditions.join(","));
    } else if (cursorConditions.length > 0) {
      query = query.or(cursorConditions.join(","));
    }

    const { data: people, error } = await query.limit(limit + 1);

    if (error) {
      console.error("Error fetching people:", error);
      return NextResponse.json(
        { error: "Failed to fetch people" },
        { status: 500 }
      );
    }

    const rows = people || [];
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

    // Post-query filtering for tag and company_id (joined data)
    let filtered = page;
    if (tag) {
      filtered = filtered.filter((p) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p as any).person_tags?.some((pt: any) => pt.tags?.name === tag)
      );
    }
    if (companyId) {
      filtered = filtered.filter((p) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p as any).person_companies?.some((pc: any) => pc.company_id === companyId)
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
    console.error("Error in people API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/people - Create a new person
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = createPersonSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const personData = parsed.data;

    // Normalize email
    if (personData.email) {
      personData.email = personData.email.toLowerCase().trim();

      // Check for duplicate email in workspace
      const { data: existing } = await supabase
        .from("people")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("email", personData.email)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "A person with this email already exists in this workspace" },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("people")
      .insert({
        ...personData,
        custom_data: (personData.custom_data ?? null) as Json,
        workspace_id: ctx.workspaceId,
        sources: ["manual"],
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating person:", error);
      return NextResponse.json(
        { error: "Failed to create person" },
        { status: 500 }
      );
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "person",
      entityId: data.id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in people API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
