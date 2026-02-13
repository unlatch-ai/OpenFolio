import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/claim-invites
 *
 * Called after login to claim any pending invites for the user's email.
 * Creates workspace_members for each valid invite and deletes the invites.
 *
 * This should be called client-side immediately after successful login.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userEmail = user.email.toLowerCase().trim();

    // Find all pending invites for this email
    const nowIso = new Date().toISOString();
    const admin = createAdminClient();

    const { data: invites, error: invitesError } = await admin
      .from("workspace_invites")
      .select("id, workspace_id, role")
      .eq("email", userEmail)
      .is("accepted_at", null)
      .gt("expires_at", nowIso);

    if (invitesError) {
      console.error("claim-invites:fetch-invites failed", invitesError);
      return NextResponse.json(
        { error: "Failed to fetch invites" },
        { status: 500 }
      );
    }

    if (!invites || invites.length === 0) {
      return NextResponse.json({
        claimed: 0,
        workspaces: [],
      });
    }

    // Ensure profile exists
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      const { error: profileError } = await admin
        .from("profiles")
        .insert({
          id: user.id,
          role: "user",
          email: user.email,
          full_name: (user.user_metadata?.full_name as string | undefined) || null,
        });

      if (profileError) {
        console.error("claim-invites:create-profile failed", profileError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }
    }

    // Check existing memberships to avoid duplicates
    const workspaceIds = invites.map(inv => inv.workspace_id);
    const { data: existingMemberships } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .in("workspace_id", workspaceIds);

    const existingWorkspaceIds = new Set(
      (existingMemberships || []).map(m => m.workspace_id)
    );

    // Filter invites to only new workspaces
    const newInvites = invites.filter(inv => !existingWorkspaceIds.has(inv.workspace_id));

    if (newInvites.length === 0) {
      // Mark invites as accepted since user already has memberships
      await admin
        .from("workspace_invites")
        .update({ accepted_at: nowIso })
        .in("id", invites.map(inv => inv.id));

      return NextResponse.json({
        claimed: 0,
        workspaces: [],
        message: "Already a member of all invited workspaces",
      });
    }

    // Create memberships for new invites
    const membershipsToCreate = newInvites.map(inv => ({
      user_id: user.id,
      workspace_id: inv.workspace_id,
      role: inv.role,
    }));

    const { error: membershipError } = await admin
      .from("workspace_members")
      .insert(membershipsToCreate);

    if (membershipError) {
      console.error("Error creating memberships:", membershipError);
      console.error("claim-invites:create-memberships failed", membershipError);
      return NextResponse.json(
        { error: "Failed to create memberships" },
        { status: 500 }
      );
    }

    // Delete claimed invites
    await admin
      .from("workspace_invites")
      .update({ accepted_at: nowIso })
      .in("id", invites.map(inv => inv.id));

    // Get workspace names for the response
    const { data: workspaces } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", newInvites.map(inv => inv.workspace_id));

    return NextResponse.json({
      claimed: newInvites.length,
      workspaces: workspaces || [],
      message: `Successfully joined ${newInvites.length} workspace(s)`,
    });
  } catch (error) {
    console.error("claim-invites:unhandled-error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
