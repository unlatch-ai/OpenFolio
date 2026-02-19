import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeMode } from "@/lib/runtime-mode";
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
        await ensureProfile(admin, {
          userId: user.id,
          email: user.email,
          fullName: (user.user_metadata?.full_name as string | undefined) || null,
        });
        await ensurePersonalWorkspace(admin, {
          userId: user.id,
          fullName: (user.user_metadata?.full_name as string | undefined) || null,
        });
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
