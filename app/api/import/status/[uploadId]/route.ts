import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

/**
 * GET /api/import/status/[uploadId] - Get import job status
 *
 * Returns the current progress and status of an import job.
 * Frontend should poll this endpoint every 2-3 seconds during processing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const { uploadId } = await params;
    const supabase = await createClient();

    // Get import record
    const { data: importRecord, error: importError } = await supabase
      .from("import_records")
      .select("id, status, progress, result, created_at, completed_at, file_name")
      .eq("id", uploadId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (importError) {
      console.error("Error fetching import record:", importError);
      return NextResponse.json(
        { error: "Failed to fetch import record" },
        { status: 500 }
      );
    }

    if (!importRecord) {
      return NextResponse.json(
        { error: "Import record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      uploadId: importRecord.id,
      status: importRecord.status,
      progress: importRecord.progress,
      result: importRecord.result,
      fileName: importRecord.file_name,
      createdAt: importRecord.created_at,
      completedAt: importRecord.completed_at,
    });
  } catch (error) {
    console.error("Error getting import status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
