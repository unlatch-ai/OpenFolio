import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { parse } from "csv-parse/sync";
import type { CSVAnalyzeResponse, CSVColumnMapping } from "@/types";

// Common column name variations that map to system fields
const COLUMN_MAPPINGS: Record<string, string> = {
  // Email variations
  email: "email",
  "e-mail": "email",
  email_address: "email",
  emailaddress: "email",

  // First name variations
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  fname: "first_name",
  given_name: "first_name",

  // Last name variations
  last_name: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  lname: "last_name",
  surname: "last_name",
  family_name: "last_name",
};

/**
 * Suggest mapping for a column based on its name
 */
function suggestMapping(columnName: string): { maps_to: string; is_system_field: boolean } {
  const normalized = columnName.toLowerCase().trim();

  // Check if it's a known system field variation
  if (COLUMN_MAPPINGS[normalized]) {
    return {
      maps_to: COLUMN_MAPPINGS[normalized],
      is_system_field: true,
    };
  }

  // Otherwise, use the column name as-is for custom_data
  // Convert to snake_case for consistency
  const snakeCase = columnName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return {
    maps_to: snakeCase || columnName,
    is_system_field: false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "File must be a CSV" }, { status: 400 });
    }

    // Validate file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 }
      );
    }

    // Read file content
    const text = await file.text();

    // Parse CSV
    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle BOM character
      });
    } catch {
      return NextResponse.json(
        { error: "Failed to parse CSV. Please ensure it's a valid CSV file." },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Get column names from first record
    const columns = Object.keys(records[0]);

    // Get sample rows (first 5)
    const sampleRows = records.slice(0, 5);

    // Generate suggested mappings
    const suggestedMappings: CSVColumnMapping[] = columns.map((col) => {
      const suggestion = suggestMapping(col);
      return {
        csv_column: col,
        maps_to: suggestion.maps_to,
        is_system_field: suggestion.is_system_field,
      };
    });

    // Check if email column was found
    const hasEmail = suggestedMappings.some(
      (m) => m.maps_to === "email" && m.is_system_field
    );

    if (!hasEmail) {
      // Try to find a column that looks like it contains emails
      const emailColumn = columns.find((col) => {
        const sampleValue = records[0][col];
        return sampleValue && sampleValue.includes("@");
      });

      if (emailColumn) {
        const mapping = suggestedMappings.find((m) => m.csv_column === emailColumn);
        if (mapping) {
          mapping.maps_to = "email";
          mapping.is_system_field = true;
        }
      }
    }

    // Store the CSV temporarily for processing
    // In production, you'd want to store this in a temp location or cloud storage
    // For now, we'll create an import record and store file info
    const { data: importRecord, error: insertError } = await supabase
      .from("import_records")
      .insert({
        workspace_id: ctx.workspaceId,
        import_type: "csv_contacts",
        status: "pending",
        file_name: file.name,
        file_size: file.size,
        progress: { step: "analyzing", processed: 0, total: records.length },
        result: {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create import record:", insertError);
      return NextResponse.json(
        { error: "Failed to create import record" },
        { status: 500 }
      );
    }

    // Store the raw CSV content in the result for later processing
    // In production, you'd store this in cloud storage
    await supabase
      .from("import_records")
      .update({
        result: { raw_csv: text },
      })
      .eq("id", importRecord.id);

    const response: CSVAnalyzeResponse & { upload_id: string } = {
      upload_id: importRecord.id,
      columns,
      sample_rows: sampleRows,
      row_count: records.length,
      suggested_mappings: suggestedMappings,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("CSV analyze error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
