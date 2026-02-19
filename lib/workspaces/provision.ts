import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "workspace";
}

function defaultWorkspaceName(fullName?: string | null) {
  const first = fullName?.trim().split(/\s+/)[0];
  if (first) return `${first}'s Workspace`;
  return "My Workspace";
}

export async function createWorkspaceForOwner(
  admin: AdminClient,
  params: { userId: string; name: string }
) {
  const uniqueSlug = `${slugify(params.name)}-${Date.now()}`;
  const { data: workspaceData, error: workspaceError } = await admin
    .from("workspaces")
    .insert({ name: params.name, slug: uniqueSlug })
    .select("id")
    .single();

  if (workspaceError || !workspaceData) {
    throw new Error(workspaceError?.message || "Failed to create workspace");
  }

  const { error: membershipError } = await admin
    .from("workspace_members")
    .insert({ user_id: params.userId, workspace_id: workspaceData.id, role: "owner" });

  if (membershipError) {
    await admin.from("workspaces").delete().eq("id", workspaceData.id);
    throw new Error(membershipError.message);
  }

  return workspaceData.id;
}

export async function ensureProfile(
  admin: AdminClient,
  params: { userId: string; email?: string | null; fullName?: string | null }
) {
  const { userId, email, fullName } = params;
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, role: "user", email: email ?? null, full_name: fullName ?? null });

  if (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }
}

export async function ensurePersonalWorkspace(
  admin: AdminClient,
  params: { userId: string; fullName?: string | null }
) {
  const { userId, fullName } = params;
  const { data: existingMembership } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingMembership?.workspace_id) {
    return {
      workspaceId: existingMembership.workspace_id,
      role: existingMembership.role as "owner" | "member",
      created: false,
    };
  }

  const name = defaultWorkspaceName(fullName);
  const workspaceId = await createWorkspaceForOwner(admin, { userId, name });

  return {
    workspaceId,
    role: "owner" as const,
    created: true,
  };
}
