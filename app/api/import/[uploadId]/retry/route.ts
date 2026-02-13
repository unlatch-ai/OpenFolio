import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

/**
 * POST /api/import/[uploadId]/retry - Retry a failed import
 *
 * Currently a placeholder. CSV imports are processed inline and don't
 * support retry via this endpoint. Will be implemented when background
 * import jobs are added in Wave 2.
 */
export async function POST(
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

    // Get the import record
    const { data: importRecord, error: fetchError } = await supabase
      .from("import_records")
      .select("id, status, result, import_type")
      .eq("id", uploadId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (fetchError || !importRecord) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

    // Only allow retry for failed or cancelled imports
    if (
      !importRecord.status ||
      !["error", "cancelled"].includes(importRecord.status)
    ) {
      return NextResponse.json(
        { error: `Cannot retry import with status: ${importRecord.status}` },
        { status: 400 }
      );
    }

    // CSV imports are processed inline and cannot be retried via this endpoint.
    // Users should re-upload the CSV instead.
    return NextResponse.json(
      {
        error:
          "Retry is not supported for CSV imports. Please re-upload the file.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error retrying import:", error);
    return NextResponse.json(
      { error: "Failed to retry import" },
      { status: 500 }
    );
  }
}
