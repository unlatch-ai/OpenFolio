import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { z } from "zod";

const tagBodySchema = z.object({
  tag_id: z.string().uuid(),
});

// POST /api/people/[id]/tags - Add a tag to a person
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
    const parsed = tagBodySchema.safeParse(body);
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
      .from("person_tags")
      .insert({
        person_id: id,
        tag_id: parsed.data.tag_id,
        workspace_id: ctx.workspaceId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Tag already assigned to this person" },
          { status: 409 }
        );
      }
      console.error("Error adding tag to person:", error);
      return NextResponse.json(
        { error: "Failed to add tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in person tags API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/people/[id]/tags - Remove a tag from a person
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

    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("person_tags")
      .delete()
      .eq("person_id", id)
      .eq("tag_id", parsed.data.tag_id)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      console.error("Error removing tag from person:", error);
      return NextResponse.json(
        { error: "Failed to remove tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in person tags API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
