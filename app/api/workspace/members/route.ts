import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

/**
 * GET /api/org/members - List members of current org
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // Get memberships
    const { data: memberships, error } = await supabase
      .from("workspace_members")
      .select("id, user_id, role, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching members:", error);
      return NextResponse.json(
        { error: "Failed to fetch members" },
        { status: 500 }
      );
    }

    const memberIds = (memberships || []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", memberIds)
      : { data: [] as { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null }[] };

    const profilesById = new Map((profiles || []).map((p) => [p.id, p]));
    const enriched = (memberships || []).map((member) => ({
      ...member,
      profiles: profilesById.get(member.user_id) || null,
    }));

    return NextResponse.json({ members: enriched });
  } catch (error) {
    console.error("Error in members API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
