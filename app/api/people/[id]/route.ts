import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";

const updatePersonSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  relationship_type: z.string().optional(),
  next_followup_at: z.string().datetime().nullable().optional(),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/people/[id] - Get person detail with related data
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
      .from("people")
      .select(`
        *,
        social_profiles(*),
        person_companies(*, companies(*)),
        person_tags(tags(*)),
        notes(*)
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch recent interactions
    const { data: interactions } = await supabase
      .from("interaction_people")
      .select("role, interactions(*)")
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      data: { ...data, recent_interactions: interactions || [] },
    });
  } catch (error) {
    console.error("Error in person detail API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/people/[id] - Update a person
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
    const parsed = updatePersonSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    // Normalize email if provided
    if (updateData.email && typeof updateData.email === "string") {
      updateData.email = updateData.email.toLowerCase().trim();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("people")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "person",
      entityId: id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in person update API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/people/[id] - Delete a person
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

    // Verify person exists in this workspace
    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("people")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      console.error("Error deleting person:", error);
      return NextResponse.json(
        { error: "Failed to delete person" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in person delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
