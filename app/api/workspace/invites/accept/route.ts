import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, isInviteExpired } from "@/lib/invites";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const token = body?.token as string | undefined;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const admin = createAdminClient();

    const { data: invite, error } = await admin
      .from("workspace_invites")
      .select("id, workspace_id, email, role, expires_at, accepted_at")
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

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Invite email does not match your account" },
        { status: 403 }
      );
    }

    const { error: membershipError } = await admin
      .from("workspace_members")
      .insert({
        user_id: user.id,
        workspace_id: invite.workspace_id,
        role: invite.role,
      });

    if (membershipError) {
      if (membershipError.code === "23505") {
        await admin
          .from("workspace_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invite.id);
        return NextResponse.json({ success: true, alreadyMember: true });
      }
      console.error("Error creating membership:", membershipError);
      return NextResponse.json(
        { error: "Failed to create membership" },
        { status: 500 }
      );
    }

    await admin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error accepting invite:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
