import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeMode, isHostedInviteOnlySignup } from "@/lib/runtime-mode";
import { ensureProfile } from "@/lib/workspaces/provision";
import { z } from "zod";

const onboardingSchema = z.object({
  organizationName: z.string().min(2),
});

export async function POST(request: NextRequest) {
  try {
    const mode = getRuntimeMode();
    if (mode.authMode === "none") {
      return NextResponse.json(
        { error: "Onboarding is disabled in no-auth mode" },
        { status: 400 }
      );
    }
    if (isHostedInviteOnlySignup()) {
      return NextResponse.json(
        { error: "Onboarding is disabled when hosted signup is invite-only" },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user already has any workspace membership
    const { data: existingMembership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json(
        { error: "You already belong to a workspace" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input data" },
        { status: 400 }
      );
    }

    const { organizationName } = parsed.data;

    const baseSlug = organizationName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const uniqueSlug = `${baseSlug}-${Date.now()}`;

    // Create workspace
    const { data: workspaceData, error: workspaceError } = await admin
      .from("workspaces")
      .insert({ name: organizationName, slug: uniqueSlug })
      .select("id, name, slug")
      .single();

    if (workspaceError) {
      console.error("Error creating workspace:", workspaceError);
      return NextResponse.json(
        { error: "Failed to create workspace" },
        { status: 500 }
      );
    }

    await ensureProfile(admin, {
      userId: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) || null,
    });

    // Create membership as owner
    const { error: membershipError } = await admin
      .from("workspace_members")
      .insert({ user_id: user.id, workspace_id: workspaceData.id, role: "owner" });

    if (membershipError) {
      await admin.from("workspaces").delete().eq("id", workspaceData.id);
      console.error("Error creating membership:", membershipError);
      return NextResponse.json(
        { error: "Failed to create membership" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspaceData.id,
        name: workspaceData.name,
        slug: workspaceData.slug,
      },
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
