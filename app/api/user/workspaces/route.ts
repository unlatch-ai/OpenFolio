import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { ensureSelfHostedContext } from "@/lib/selfhost/bootstrap";

/**
 * GET /api/user/workspaces - List workspaces the user belongs to
 */
export async function GET() {
  try {
    const mode = getRuntimeMode();
    if (mode.authMode === "none") {
      const context = await ensureSelfHostedContext();
      const admin = createAdminClient();
      const { data: workspace } = await admin
        .from("workspaces")
        .select("id, name, slug, settings, created_at")
        .eq("id", context.workspaceId)
        .single();

      return NextResponse.json({
        workspaces: workspace
          ? [{ ...workspace, role: "owner" as const }]
          : [],
      });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's memberships with workspace details
    const { data: memberships, error: membershipError } = await supabase
      .from("workspace_members")
      .select(`
        role,
        workspace_id,
        workspaces (
          id,
          name,
          slug,
          settings,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError);
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 500 }
      );
    }

    // Transform to flat workspace list with role
    type WorkspaceData = { id: string; name: string; slug: string; settings: Record<string, unknown> | null; created_at: string };
    const workspaces = (memberships || []).map((m) => {
      // Handle both single object and array (Supabase can return either)
      const wsData = m.workspaces as WorkspaceData | WorkspaceData[] | null;
      const ws = Array.isArray(wsData) ? wsData[0] : wsData;
      return {
        ...ws,
        role: m.role,
      };
    }).filter((w) => w.id); // Filter out any null workspaces

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Error in user workspaces API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
