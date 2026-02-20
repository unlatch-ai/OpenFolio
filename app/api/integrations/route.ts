import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listConnectors } from "@/lib/integrations/registry";

export async function GET(request: NextRequest) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const supabase = createAdminClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", ctx.workspaceId)
    .single();
  const workspaceTimezone =
    workspace?.settings &&
    typeof workspace.settings === "object" &&
    "timezone" in workspace.settings &&
    typeof workspace.settings.timezone === "string" &&
    workspace.settings.timezone.length > 0
      ? workspace.settings.timezone
      : "UTC";

  // Get all connected integrations for this workspace
  const { data: integrations } = await supabase
    .from("integrations")
    .select(
      "id, provider, status, last_synced_at, created_at, auto_sync_enabled, auto_sync_time_local, auto_sync_timezone, last_sync_error"
    )
    .eq("workspace_id", ctx.workspaceId);

  // Get all available connectors
  const connectors = listConnectors().map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    auth: c.auth,
  }));

  // Merge connector info with integration status
  const result = connectors.map((connector) => {
    const integration = integrations?.find(
      (i) => i.provider === connector.id
    );
    return {
      ...connector,
      integrationId: integration?.id || null,
      status: integration?.status || "disconnected",
      lastSyncedAt: integration?.last_synced_at || null,
      autoSyncEnabled: integration?.auto_sync_enabled || false,
      autoSyncTimeLocal:
        typeof integration?.auto_sync_time_local === "string"
          ? integration.auto_sync_time_local.slice(0, 5)
          : "02:00",
      autoSyncTimezone: integration?.auto_sync_timezone || workspaceTimezone,
      lastSyncError: integration?.last_sync_error || null,
    };
  });

  return NextResponse.json(result);
}
