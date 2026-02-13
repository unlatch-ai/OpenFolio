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

  // Get all connected integrations for this workspace
  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, provider, status, last_synced_at, created_at")
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
    };
  });

  return NextResponse.json(result);
}
