import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const onboardingSchema = z.object({
  organizationName: z.string().min(2),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user already has any workspace membership
    const { data: existingMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

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
    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({ name: organizationName, slug: uniqueSlug })
      .select()
      .single();

    if (workspaceError) {
      console.error("Error creating workspace:", workspaceError);
      return NextResponse.json(
        { error: "Failed to create workspace" },
        { status: 500 }
      );
    }

    // Ensure profile exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({ id: user.id, role: "user" });

      if (profileError) {
        await supabase.from("workspaces").delete().eq("id", workspaceData.id);
        console.error("Error creating profile:", profileError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }
    }

    // Create membership as owner
    const { error: membershipError } = await supabase
      .from("workspace_members")
      .insert({ user_id: user.id, workspace_id: workspaceData.id, role: "owner" });

    if (membershipError) {
      await supabase.from("workspaces").delete().eq("id", workspaceData.id);
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
