import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePersonalWorkspace, ensureProfile } from "@/lib/workspaces/provision";

const DEFAULT_EMAIL = process.env.OPENFOLIO_SELFHOST_DEFAULT_EMAIL || "local@openfolio.selfhost";
const DEFAULT_NAME = process.env.OPENFOLIO_SELFHOST_DEFAULT_NAME || "Local User";

type BootstrapContext = {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceRole: "owner";
};

async function getSettings(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("instance_settings" as never)
    .select("default_user_id, default_workspace_id")
    .limit(1)
    .maybeSingle();

  return (data as { default_user_id?: string | null; default_workspace_id?: string | null } | null) || null;
}

async function persistSettings(
  admin: ReturnType<typeof createAdminClient>,
  payload: { userId: string; workspaceId: string }
) {
  await admin
    .from("instance_settings" as never)
    .upsert(
      {
        id: true,
        default_user_id: payload.userId,
        default_workspace_id: payload.workspaceId,
      } as never,
      { onConflict: "id" }
    );
}

async function findUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function ensureSingletonUser(admin: ReturnType<typeof createAdminClient>, preferredUserId?: string | null) {
  if (preferredUserId) {
    const { data, error } = await admin.auth.admin.getUserById(preferredUserId);
    if (!error && data?.user) return data.user;
  }

  const existing = await findUserByEmail(admin, DEFAULT_EMAIL);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password: process.env.OPENFOLIO_SELFHOST_DEFAULT_PASSWORD || crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: DEFAULT_NAME },
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Failed to create self-host user");
  }

  return data.user;
}

export async function ensureSelfHostedContext(): Promise<BootstrapContext> {
  const admin = createAdminClient();
  const settings = await getSettings(admin);

  const user = await ensureSingletonUser(admin, settings?.default_user_id);
  const fullName = (user.user_metadata?.full_name as string | undefined) || DEFAULT_NAME;
  const userEmail = user.email || DEFAULT_EMAIL;

  await ensureProfile(admin, {
    userId: user.id,
    email: userEmail,
    fullName,
  });

  const workspace = await ensurePersonalWorkspace(admin, {
    userId: user.id,
    fullName,
  });

  await persistSettings(admin, {
    userId: user.id,
    workspaceId: workspace.workspaceId,
  });

  return {
    userId: user.id,
    userEmail,
    workspaceId: workspace.workspaceId,
    workspaceRole: "owner",
  };
}

