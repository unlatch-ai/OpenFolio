import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, isInviteExpired } from "@/lib/invites";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const admin = createAdminClient();

    const { data: appInvite } = await admin
      .from("app_invites")
      .select("email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (appInvite) {
      if (appInvite.accepted_at) {
        return NextResponse.json({ error: "Invite already accepted" }, { status: 410 });
      }
      if (isInviteExpired(appInvite.expires_at)) {
        return NextResponse.json({ error: "Invite expired" }, { status: 410 });
      }
      return NextResponse.json({
        type: "app",
        email: appInvite.email,
        expiresAt: appInvite.expires_at,
      });
    }

    const { data: workspaceInvite } = await admin
      .from("workspace_invites")
      .select("workspace_id, role, invited_by, email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!workspaceInvite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (workspaceInvite.accepted_at) {
      return NextResponse.json({ error: "Invite already accepted" }, { status: 410 });
    }

    if (isInviteExpired(workspaceInvite.expires_at)) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    const { data: workspace } = await admin
      .from("workspaces")
      .select("name")
      .eq("id", workspaceInvite.workspace_id)
      .single();

    const { data: inviter } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", workspaceInvite.invited_by)
      .single();

    return NextResponse.json({
      type: "workspace",
      email: workspaceInvite.email,
      role: workspaceInvite.role,
      workspace: {
        id: workspaceInvite.workspace_id,
        name: workspace?.name || "Workspace",
      },
      inviterName: inviter?.full_name || null,
      expiresAt: workspaceInvite.expires_at,
    });
  } catch (error) {
    console.error("Error previewing invite:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
