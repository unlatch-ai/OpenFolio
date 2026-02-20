import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { tasks } from "@trigger.dev/sdk";
import type { processCsvImport } from "@/src/trigger/process-csv-import";
import type { CSVColumnMapping } from "@/types";

interface ProcessRequest {
  upload_id: string;
  mappings: CSVColumnMapping[];
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const limitResult = rateLimit(request, {
      key: "import:csv",
      limit: 5,
      windowMs: 60_000,
    });
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const body: ProcessRequest = await request.json();
    const { upload_id, mappings } = body;

    if (!upload_id || !mappings) {
      return NextResponse.json(
        { error: "Missing upload_id or mappings" },
        { status: 400 }
      );
    }

    // Verify email mapping exists before queuing
    const emailMapping = mappings.find((m) => m.maps_to === "email");
    if (!emailMapping) {
      return NextResponse.json(
        { error: "Email column mapping is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify the import record exists and belongs to this workspace
    const { data: importRecord, error: fetchError } = await supabase
      .from("import_records")
      .select("id, status, result")
      .eq("id", upload_id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (fetchError || !importRecord) {
      return NextResponse.json(
        { error: "Import record not found" },
        { status: 404 }
      );
    }

    // Ensure CSV data was uploaded
    const resultObj =
      importRecord.result &&
      typeof importRecord.result === "object" &&
      !Array.isArray(importRecord.result)
        ? (importRecord.result as Record<string, unknown>)
        : {};
    if (!resultObj.raw_csv) {
      return NextResponse.json(
        { error: "CSV data not found. Please re-upload the file." },
        { status: 400 }
      );
    }

    // Mark as queued
    await supabase
      .from("import_records")
      .update({
        status: "processing",
        progress: { step: "queued", processed: 0, total: 0 },
      })
      .eq("id", upload_id);

    // Dispatch to Trigger.dev background task
    await tasks.trigger<typeof processCsvImport>("process-csv-import", {
      uploadId: upload_id,
      workspaceId: ctx.workspaceId,
      mappings,
    });

    return NextResponse.json(
      {
        success: true,
        uploadId: upload_id,
        message: "Import queued for processing",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("CSV process error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
