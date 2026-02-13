import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  logo_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/companies/[id] - Get company detail with related data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("companies")
      .select(`
        *,
        person_companies(*, people(id, first_name, last_name, email, avatar_url)),
        company_tags(tags(*))
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch recent interactions involving this company's people
    const personIds = ((data as Record<string, unknown>).person_companies as Array<{ person_id: string }> | undefined)
      ?.map((pc) => pc.person_id) ?? [];

    let recentInteractions: unknown[] = [];
    if (personIds.length > 0) {
      const { data: interactions } = await supabase
        .from("interaction_people")
        .select("role, interactions(*)")
        .in("person_id", personIds)
        .order("created_at", { ascending: false })
        .limit(20);
      recentInteractions = interactions || [];
    }

    return NextResponse.json({
      data: { ...data, recent_interactions: recentInteractions },
    });
  } catch (error) {
    console.error("Error in company detail API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/companies/[id] - Update a company
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = updateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    // Normalize domain if provided
    if (updateData.domain && typeof updateData.domain === "string") {
      updateData.domain = updateData.domain.toLowerCase().trim();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "company",
      entityId: id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in company update API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/companies/[id] - Delete a company
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // Verify company exists in this workspace
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("companies")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      console.error("Error deleting company:", error);
      return NextResponse.json(
        { error: "Failed to delete company" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in company delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
