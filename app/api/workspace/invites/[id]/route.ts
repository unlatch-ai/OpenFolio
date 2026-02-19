import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError, requireOwner } from "@/lib/auth";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { sendWorkspaceInviteEmail } from "@/lib/email";
import { hashInviteToken, getInviteExpiry } from "@/lib/invites";
import crypto from "crypto";

/**
 * DELETE /api/org/invites/[id] - Cancel an invite (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (getRuntimeMode().authMode === "none") {
      return NextResponse.json({ error: "Invites are disabled in no-auth mode" }, { status: 403 });
    }

    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    // Only owners can delete invites
    if (!requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Only owners can cancel invites" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supabase = await createClient();

    // Verify invite belongs to this org
    const { data: invite } = await supabase
      .from("workspace_invites")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("workspace_invites")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting invite:", error);
      return NextResponse.json(
        { error: "Failed to delete invite" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in invite delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org/invites/[id] - Resend invite (owner only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (getRuntimeMode().authMode === "none") {
      return NextResponse.json({ error: "Invites are disabled in no-auth mode" }, { status: 403 });
    }

    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    if (!requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Only owners can resend invites" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supabase = await createClient();

    const { data: invite } = await supabase
      .from("workspace_invites")
      .select("id, email, role")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found" },
        { status: 404 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = getInviteExpiry(7);

    const { error: updateError } = await supabase
      .from("workspace_invites")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        last_sent_at: new Date().toISOString(),
        accepted_at: null,
      })
      .eq("id", invite.id);

    if (updateError) {
      console.error("Error updating invite:", updateError);
      return NextResponse.json(
        { error: "Failed to resend invite" },
        { status: 500 }
      );
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const inviteLink = `${appUrl}/invite?token=${token}`;

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", ctx.workspaceId)
      .single();

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.user.id)
      .single();

    await sendWorkspaceInviteEmail({
      to: invite.email,
      workspaceName: workspace?.name || "Workspace",
      inviterName: inviterProfile?.full_name,
      role: invite.role as "owner" | "member",
      inviteLink,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in invite resend API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
