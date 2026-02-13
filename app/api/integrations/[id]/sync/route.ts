import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk";
import type { syncIntegration } from "@/src/trigger/sync-integration";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;

  // Verify integration belongs to this workspace (IDOR prevention)
  const supabase = await createClient();
  const { data: integration } = await supabase
    .from("integrations")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();

  if (!integration) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  try {
    await tasks.trigger<typeof syncIntegration>("sync-integration", {
      integrationId: id,
      workspaceId: ctx.workspaceId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to trigger sync:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
