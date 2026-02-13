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
const SORTABLE_FIELDS = new Set(["created_at", "updated_at", "name", "industry", "location"]);
const NULLS_LAST_FIELDS = new Set(["industry", "location"]);

const createCompanySchema = z.object({
  name: z.string().min(1, "Name is required"),
  domain: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  logo_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/companies - List companies with cursor pagination
export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(request, {
      key: "companies:list",
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
    const industry = searchParams.get("industry");
    const location = searchParams.get("location");
    const sortParam = searchParams.get("sort") ?? "updated_at";
    const dirParam = searchParams.get("dir") ?? "desc";
    const sort = SORTABLE_FIELDS.has(sortParam) ? sortParam : "updated_at";
    const dir = dirParam === "asc" ? "asc" : "desc";
    const cursor = decodeCursor(searchParams.get("cursor"));

    let query = supabase
      .from("companies")
      .select(`
        *,
        person_companies(*, people(id, first_name, last_name, email, avatar_url)),
        company_tags(tags(id, name, color))
      `)
      .eq("workspace_id", ctx.workspaceId);

    if (industry) {
      query = query.eq("industry", industry);
    }
    if (location) {
      query = query.eq("location", location);
    }

    const nullsLast = NULLS_LAST_FIELDS.has(sort);
    query = query
      .order(sort, nullsLast ? { ascending: dir === "asc", nullsFirst: false } : { ascending: dir === "asc" })
      .order("id", { ascending: dir === "asc" });

    const searchConditions: string[] = [];
    if (search) {
      const pattern = formatFilterValue(`%${search}%`);
      searchConditions.push(
        `name.ilike.${pattern}`,
        `domain.ilike.${pattern}`,
        `industry.ilike.${pattern}`,
        `description.ilike.${pattern}`
      );
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

    const { data: companies, error } = await query.limit(limit + 1);

    if (error) {
      console.error("Error fetching companies:", error);
      return NextResponse.json(
        { error: "Failed to fetch companies" },
        { status: 500 }
      );
    }

    const rows = companies || [];
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

    return NextResponse.json(
      {
        data: page,
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
    console.error("Error in companies API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/companies - Create a new company
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const companyData = parsed.data;

    // Normalize domain
    if (companyData.domain) {
      companyData.domain = companyData.domain.toLowerCase().trim();
    }

    // Check for duplicate name in workspace (DB has unique constraint, but give a nicer error)
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("name", companyData.name)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A company with this name already exists in this workspace" },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("companies")
      .insert({
        ...companyData,
        workspace_id: ctx.workspaceId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating company:", error);
      return NextResponse.json(
        { error: "Failed to create company" },
        { status: 500 }
      );
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "company",
      entityId: data.id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in companies API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
