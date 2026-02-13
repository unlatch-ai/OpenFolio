import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { z } from "zod";

const createTagSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().optional(),
});

// GET /api/tags - List all workspace tags
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching tags:", error);
      return NextResponse.json(
        { error: "Failed to fetch tags" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("Error in tags API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();

    // Check for duplicate name in workspace
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("name", parsed.data.name)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A tag with this name already exists in this workspace" },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("tags")
      .insert({
        ...parsed.data,
        workspace_id: ctx.workspaceId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating tag:", error);
      return NextResponse.json(
        { error: "Failed to create tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in tags API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/tags?id=<tag_id> - Delete a tag
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const tagId = request.nextUrl.searchParams.get("id");
    if (!tagId) {
      return NextResponse.json({ error: "Tag id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify tag exists in this workspace
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("id", tagId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", tagId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      console.error("Error deleting tag:", error);
      return NextResponse.json(
        { error: "Failed to delete tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in tags API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
