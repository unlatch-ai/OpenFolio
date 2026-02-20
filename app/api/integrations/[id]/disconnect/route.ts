import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteIntegrationSchedule } from "@/lib/integrations/schedule";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  // Delete the Trigger.dev schedule before disconnecting
  const { data: integration } = await supabase
    .from("integrations")
    .select("metadata")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();

  const meta = (integration?.metadata && typeof integration.metadata === "object" && !Array.isArray(integration.metadata))
    ? integration.metadata as Record<string, unknown>
    : {};
  const scheduleId = typeof meta.trigger_schedule_id === "string" ? meta.trigger_schedule_id : null;
  if (scheduleId) {
    await deleteIntegrationSchedule(scheduleId);
  }

  const { error } = await supabase
    .from("integrations")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
