import { createClient } from "@/lib/supabase/server";

export interface WorkspaceContext {
  user: { id: string; email?: string };
  workspaceId: string;
  workspaceRole: 'owner' | 'member';
}

export interface WorkspaceContextError {
  error: string;
  status: number;
}

export type WorkspaceContextResult = WorkspaceContext | WorkspaceContextError;

export function isWorkspaceContextError(result: WorkspaceContextResult): result is WorkspaceContextError {
  return 'error' in result;
}

/**
 * Get authenticated user and validate workspace membership.
 *
 * @param request - The incoming request (to read x-workspace-id header)
 * @returns WorkspaceContext on success, WorkspaceContextError on failure
 */
export async function getWorkspaceContext(request: Request): Promise<WorkspaceContextResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 };
  }

  // Get requested workspace from header
  const workspaceId = request.headers.get("x-workspace-id") || request.headers.get("x-org-id"); // Support both headers for transition

  if (workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!membership) {
      return { error: "Not a member of this workspace", status: 403 };
    }

    return {
      user: { id: user.id, email: user.email },
      workspaceId,
      workspaceRole: membership.role as 'owner' | 'member',
    };
  }

  // No workspaceId specified - pick user's first workspace
  const { data: firstMembership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!firstMembership) {
    return { error: "No workspace found", status: 404 };
  }

  return {
    user: { id: user.id, email: user.email },
    workspaceId: firstMembership.workspace_id,
    workspaceRole: firstMembership.role as 'owner' | 'member',
  };
}

/**
 * Check if user has owner role in their workspace.
 */
export function requireOwner(ctx: WorkspaceContext): boolean {
  return ctx.workspaceRole === 'owner';
}
