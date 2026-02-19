import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError, requireOwner } from "@/lib/auth";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { z } from "zod";

const updateMemberSchema = z.object({
  role: z.enum(["owner", "member"]),
});

/**
 * PATCH /api/org/members/[userId] - Update member role (owner only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (getRuntimeMode().authMode === "none") {
      return NextResponse.json({ error: "Team management is disabled in no-auth mode" }, { status: 403 });
    }

    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    if (!requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Only owners can update member roles" },
        { status: 403 }
      );
    }

    const { userId } = await params;
    const body = await request.json();
    const parsed = updateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    const { role } = parsed.data;
    const supabase = await createClient();

    // If demoting from owner, ensure there's at least one other owner
    if (role === "member") {
      const { data: owners } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("role", "owner");

      if (owners && owners.length === 1 && owners[0].user_id === userId) {
        return NextResponse.json(
          { error: "Cannot demote the last owner" },
          { status: 400 }
        );
      }
    }

    const { data: membership, error } = await supabase
      .from("workspace_members")
      .update({ role })
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating member:", error);
      return NextResponse.json(
        { error: "Failed to update member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error("Error in member update API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/org/members/[userId] - Remove member (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (getRuntimeMode().authMode === "none") {
      return NextResponse.json({ error: "Team management is disabled in no-auth mode" }, { status: 403 });
    }

    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    if (!requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Only owners can remove members" },
        { status: 403 }
      );
    }

    const { userId } = await params;

    // Can't remove yourself
    if (userId === ctx.user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if target is the last owner
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    if (membership.role === "owner") {
      const { data: owners } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("role", "owner");

      if (owners && owners.length === 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner" },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error removing member:", error);
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in member delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
