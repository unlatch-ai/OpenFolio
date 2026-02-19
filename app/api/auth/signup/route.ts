import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashInviteToken } from "@/lib/invites";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { ensurePersonalWorkspace, ensureProfile, createWorkspaceForOwner } from "@/lib/workspaces/provision";

const signupSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().optional(),
  inviteToken: z.string().min(10).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const mode = getRuntimeMode();
    if (mode.authMode === "none") {
      return NextResponse.json(
        { error: "Signup is disabled in no-auth mode" },
        { status: 400 }
      );
    }

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

    const normalizedEmail = email.toLowerCase().trim();
    const tokenHash = inviteToken ? hashInviteToken(inviteToken) : null;
    const nowIso = new Date().toISOString();

    const { data: appInvite } = tokenHash
      ? await supabaseAdmin
          .from("app_invites")
          .select("id, email, expires_at, accepted_at")
          .eq("token_hash", tokenHash)
          .maybeSingle()
      : { data: null };

    const { data: workspaceInvite } = tokenHash
      ? await supabaseAdmin
          .from("workspace_invites")
          .select("id, workspace_id, role, email, expires_at, accepted_at")
          .eq("token_hash", tokenHash)
          .maybeSingle()
      : { data: null };

    const isAppInviteValid = appInvite && !appInvite.accepted_at && appInvite.expires_at && new Date(appInvite.expires_at).getTime() > Date.now();
    const isWorkspaceInviteValid = workspaceInvite && !workspaceInvite.accepted_at && workspaceInvite.expires_at && new Date(workspaceInvite.expires_at).getTime() > Date.now();

    if (inviteToken && !isAppInviteValid && !isWorkspaceInviteValid) {
      return NextResponse.json({ error: "Invite expired or invalid" }, { status: 403 });
    }

    const inviteEmail = isAppInviteValid
      ? appInvite!.email
      : isWorkspaceInviteValid
      ? workspaceInvite!.email
      : null;

    if (inviteEmail && inviteEmail.toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { error: "Invite email does not match signup email" },
        { status: 403 }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
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
    try {
      await ensureProfile(supabaseAdmin, {
        userId,
        email: normalizedEmail,
        fullName,
      });
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    try {
      if (isWorkspaceInviteValid) {
        const { error: membershipError } = await supabaseAdmin
          .from("workspace_members")
          .insert({
            user_id: userId,
            workspace_id: workspaceInvite!.workspace_id,
            role: workspaceInvite!.role,
          });

        if (membershipError && membershipError.code !== "23505") {
          throw membershipError;
        }

        await supabaseAdmin
          .from("workspace_invites")
          .update({ accepted_at: nowIso })
          .eq("id", workspaceInvite!.id);
      } else if (isAppInviteValid && organizationName?.trim()) {
        await createWorkspaceForOwner(supabaseAdmin, {
          userId,
          name: organizationName.trim(),
        });

        await supabaseAdmin
          .from("app_invites")
          .update({ accepted_at: nowIso })
          .eq("id", appInvite!.id);
      } else {
        await ensurePersonalWorkspace(supabaseAdmin, {
          userId,
          fullName,
        });
      }
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error && typeof error === "object" && "message" in error) {
        return NextResponse.json(
          { error: (error as { message: string }).message || "Failed to create workspace" },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
