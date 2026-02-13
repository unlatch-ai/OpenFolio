import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

/**
 * GET /api/import/current - Get the current/most recent import for the org
 *
 * Returns:
 * - Active import if one is processing
 * - Most recent failed import if it failed within the last hour (so user can retry/cancel)
 * - Most recent completed import from the last 5 minutes (to show success state)
 * - null if no relevant imports
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // First, check for any active (processing) imports
    const { data: activeImport } = await supabase
      .from("import_records")
      .select("id, status, progress, result, file_name, created_at, completed_at, import_type")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (activeImport) {
      return NextResponse.json({
        import: activeImport,
        state: "processing",
      });
    }

    // Check for pending imports (uploaded but not started)
    const { data: pendingImport } = await supabase
      .from("import_records")
      .select("id, status, progress, result, file_name, created_at, completed_at, import_type")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pendingImport) {
      return NextResponse.json({
        import: pendingImport,
        state: "pending",
      });
    }

    // Check for recent failed imports (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: failedImport } = await supabase
      .from("import_records")
      .select("id, status, progress, result, file_name, created_at, completed_at, import_type")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "error")
      .gte("completed_at", oneHourAgo)
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (failedImport) {
      return NextResponse.json({
        import: failedImport,
        state: "failed",
      });
    }

    // Check for recently completed imports (within last 5 minutes) to show success
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: completedImport } = await supabase
      .from("import_records")
      .select("id, status, progress, result, file_name, created_at, completed_at, import_type")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "completed")
      .gte("completed_at", fiveMinutesAgo)
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (completedImport) {
      return NextResponse.json({
        import: completedImport,
        state: "completed",
      });
    }

    // No relevant imports
    return NextResponse.json({
      import: null,
      state: "ready",
    });
  } catch (error) {
    console.error("Error getting current import:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
