import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashInviteToken } from "@/lib/invites";

const signupSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().optional(),
  inviteToken: z.string().min(10),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input data" },
        { status: 400 }
      );
    }

    const { fullName, email, password, organizationName, inviteToken } = parsed.data;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const tokenHash = hashInviteToken(inviteToken);
    const nowIso = new Date().toISOString();

    // Determine invite type
    const { data: appInvite } = await supabaseAdmin
      .from("app_invites")
      .select("id, email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const { data: workspaceInvite } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, workspace_id, role, email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const isAppInviteValid = appInvite && !appInvite.accepted_at && appInvite.expires_at && new Date(appInvite.expires_at).getTime() > Date.now();
    const isWorkspaceInviteValid = workspaceInvite && !workspaceInvite.accepted_at && workspaceInvite.expires_at && new Date(workspaceInvite.expires_at).getTime() > Date.now();

    if (!isAppInviteValid && !isWorkspaceInviteValid) {
      return NextResponse.json(
        { error: "Invite required or expired" },
        { status: 403 }
      );
    }

    const inviteEmail = isAppInviteValid ? appInvite!.email : workspaceInvite!.email;

    if (inviteEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Invite email does not match signup email" },
        { status: 403 }
      );
    }

    if (isAppInviteValid && (!organizationName || organizationName.trim().length < 2)) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    const userId = authData.user.id;
    // Create profile (global, no org_id)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, role: "user", email, full_name: fullName });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    if (isAppInviteValid) {
      const baseSlug = organizationName!.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const uniqueSlug = `${baseSlug}-${Date.now()}`;

      // Create workspace
      const { data: orgData, error: orgError } = await supabaseAdmin
        .from("workspaces")
        .insert({ name: organizationName, slug: uniqueSlug })
        .select()
        .single();

      if (orgError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: "Failed to create organization" },
          { status: 500 }
        );
      }

      const { error: membershipError } = await supabaseAdmin
        .from("workspace_members")
        .insert({ user_id: userId, workspace_id: orgData.id, role: "owner" });

      if (membershipError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        await supabaseAdmin.from("workspaces").delete().eq("id", orgData.id);
        return NextResponse.json(
          { error: "Failed to create membership" },
          { status: 500 }
        );
      }

      await supabaseAdmin
        .from("app_invites")
        .update({ accepted_at: nowIso })
        .eq("id", appInvite!.id);
    }

    if (isWorkspaceInviteValid) {
      const { error: membershipError } = await supabaseAdmin
        .from("workspace_members")
        .insert({ user_id: userId, workspace_id: workspaceInvite!.workspace_id, role: workspaceInvite!.role });

      if (membershipError && membershipError.code !== "23505") {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: "Failed to create membership" },
          { status: 500 }
        );
      }

      await supabaseAdmin
        .from("workspace_invites")
        .update({ accepted_at: nowIso })
        .eq("id", workspaceInvite!.id);
    }

    return NextResponse.json({ success: true, userId });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
