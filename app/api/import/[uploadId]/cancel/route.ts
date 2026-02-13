import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

/**
 * POST /api/import/[uploadId]/cancel - Cancel an import
 *
 * Marks the import record as cancelled. Currently CSV imports are
 * processed inline, so this mainly serves as a status update.
 * Background job cancellation will be added in Wave 2.
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

    // Get the import record first to check status
    const { data: importRecord, error: fetchError } = await supabase
      .from("import_records")
      .select("id, status, result")
      .eq("id", uploadId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (fetchError || !importRecord) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

    const resultObj =
      importRecord.result &&
      typeof importRecord.result === "object" &&
      !Array.isArray(importRecord.result)
        ? (importRecord.result as Record<string, unknown>)
        : {};

    // Update the import record to cancelled
    const { error: updateError } = await supabase
      .from("import_records")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        progress: {
          step: "cancelled",
          message: "Import cancelled by user",
        },
        result: {
          ...resultObj,
          cancelled_at: new Date().toISOString(),
        },
      })
      .eq("id", uploadId);

    if (updateError) {
      console.error("Error updating import status:", updateError);
      return NextResponse.json(
        { error: "Failed to update import status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Import cancelled",
    });
  } catch (error) {
    console.error("Error in cancel import:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
