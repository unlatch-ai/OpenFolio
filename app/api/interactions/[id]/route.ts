import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";

const updateInteractionSchema = z.object({
  interaction_type: z.string().min(1).optional(),
  occurred_at: z.string().datetime().optional(),
  direction: z.string().optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/interactions/[id] - Get interaction detail with participants
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
      .from("interactions")
      .select(`
        *,
        interaction_people(*, people(id, first_name, last_name, email, avatar_url))
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in interaction detail API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/interactions/[id] - Update an interaction
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
    const parsed = updateInteractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("interactions")
      .update(parsed.data)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "interaction",
      entityId: id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in interaction update API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/interactions/[id] - Delete an interaction
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

    // Verify interaction exists in this workspace
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("interactions")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      console.error("Error deleting interaction:", error);
      return NextResponse.json(
        { error: "Failed to delete interaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in interaction delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
