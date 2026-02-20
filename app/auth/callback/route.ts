import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeMode, isHostedInviteOnlySignup } from "@/lib/runtime-mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePersonalWorkspace, ensureProfile } from "@/lib/workspaces/provision";

export async function GET(request: NextRequest) {
  const mode = getRuntimeMode();
  if (mode.authMode === "none") {
    return NextResponse.redirect(`${new URL(request.url).origin}/app`);
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const responseCookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown> | undefined;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          responseCookies.push(...cookiesToSet);
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  let destination = `${origin}/app`;

  if (redirectTo && redirectTo.startsWith("/")) {
    destination = `${origin}${redirectTo}`;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      const admin = createAdminClient();
      try {
        const normalizedEmail = user.email?.toLowerCase().trim();
        const nowIso = new Date().toISOString();
        const inviteOnly = isHostedInviteOnlySignup();

        const { data: appInvite } = normalizedEmail
          ? await admin
              .from("app_invites")
              .select("id, expires_at, accepted_at")
              .eq("email", normalizedEmail)
              .is("accepted_at", null)
              .gt("expires_at", nowIso)
              .limit(1)
              .maybeSingle()
          : { data: null };

        const { data: workspaceInvites } = normalizedEmail
          ? await admin
              .from("workspace_invites")
              .select("id, workspace_id, role")
              .eq("email", normalizedEmail)
              .is("accepted_at", null)
              .gt("expires_at", nowIso)
          : { data: [] as Array<{ id: string; workspace_id: string; role: "owner" | "member" }> };

        if (inviteOnly && !appInvite && (!workspaceInvites || workspaceInvites.length === 0)) {
          await supabase.auth.signOut();
          destination = `${origin}/login?error=invite_required`;
        } else {
          await ensureProfile(admin, {
            userId: user.id,
            email: user.email,
            fullName: (user.user_metadata?.full_name as string | undefined) || null,
          });

          if (workspaceInvites && workspaceInvites.length > 0) {
            const { data: existingMemberships } = await admin
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", user.id)
              .in(
                "workspace_id",
                workspaceInvites.map((invite) => invite.workspace_id)
              );

            const existingWorkspaceIds = new Set(
              (existingMemberships || []).map((membershipRow) => membershipRow.workspace_id)
            );

            const newMemberships = workspaceInvites
              .filter((invite) => !existingWorkspaceIds.has(invite.workspace_id))
              .map((invite) => ({
                user_id: user.id,
                workspace_id: invite.workspace_id,
                role: invite.role,
              }));

            if (newMemberships.length > 0) {
              await admin.from("workspace_members").insert(newMemberships);
            }

            await admin
              .from("workspace_invites")
              .update({ accepted_at: nowIso })
              .in(
                "id",
                workspaceInvites.map((invite) => invite.id)
              );
          } else {
            await ensurePersonalWorkspace(admin, {
              userId: user.id,
              fullName: (user.user_metadata?.full_name as string | undefined) || null,
            });

            if (appInvite) {
              await admin
                .from("app_invites")
                .update({ accepted_at: nowIso })
                .eq("id", appInvite.id);
            }
          }
        }
      } catch (error) {
        console.error("Failed to auto-provision workspace during callback:", error);
      }
    }
  }

  const response = NextResponse.redirect(destination);
  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
