import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import { z } from "zod";

const createNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

// GET /api/people/[id]/notes - List notes for a person
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
      .from("notes")
      .select("*")
      .eq("person_id", id)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching notes:", error);
      return NextResponse.json(
        { error: "Failed to fetch notes" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("Error in person notes API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/people/[id]/notes - Create a note for a person
export async function POST(
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
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify person belongs to this workspace
    const { data: person } = await supabase
      .from("people")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("notes")
      .insert({
        content: parsed.data.content,
        person_id: id,
        workspace_id: ctx.workspaceId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating note:", error);
      return NextResponse.json(
        { error: "Failed to create note" },
        { status: 500 }
      );
    }

    await tasks.trigger<typeof generateEmbeddings>("generate-embeddings", {
      entityType: "note",
      entityId: data.id,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in person notes API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
