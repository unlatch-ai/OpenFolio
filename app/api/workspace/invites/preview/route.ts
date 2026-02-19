import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, isInviteExpired } from "@/lib/invites";
import { getRuntimeMode } from "@/lib/runtime-mode";

export async function GET(request: NextRequest) {
  try {
    if (getRuntimeMode().authMode === "none") {
      return NextResponse.json({ error: "Invites are disabled in no-auth mode" }, { status: 403 });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const supabase = createAdminClient();

    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .select("workspace_id, role, invited_by, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: "Invite already accepted" }, { status: 410 });
    }

    if (isInviteExpired(invite.expires_at)) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", invite.workspace_id)
      .single();

    const { data: inviter } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", invite.invited_by)
      .single();

    return NextResponse.json({
      workspace: {
        id: invite.workspace_id,
        name: workspace?.name || "Workspace",
      },
      role: invite.role,
      inviterName: inviter?.full_name || null,
      expiresAt: invite.expires_at,
    });
  } catch (error) {
    console.error("Error in invite preview API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
