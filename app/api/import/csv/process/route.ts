import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { parse } from "csv-parse/sync";
import {
  buildPersonEmbeddingText,
  mergeCustomData,
} from "@/lib/embeddings";
import { generateEmbeddings } from "@/lib/openai";
import type { CSVColumnMapping, CSVProcessResponse, Person } from "@/types";
import type { Json } from "@/lib/supabase/database.types";

interface ProcessRequest {
  upload_id: string;
  mappings: CSVColumnMapping[];
}

interface PersonToProcess {
  email: string;
  firstName: string | null;
  lastName: string | null;
  customData: Record<string, unknown>;
  existingPerson: Person | null;
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

    const supabase = await createClient();

    // Parse request body
    const body: ProcessRequest = await request.json();
    const { upload_id, mappings } = body;

    if (!upload_id || !mappings) {
      return NextResponse.json(
        { error: "Missing upload_id or mappings" },
        { status: 400 }
      );
    }

    // Verify email mapping exists
    const emailMapping = mappings.find((m) => m.maps_to === "email");
    if (!emailMapping) {
      return NextResponse.json(
        { error: "Email column mapping is required" },
        { status: 400 }
      );
    }

    // Get the import record with stored CSV
    const { data: importRecord, error: fetchError } = await supabase
      .from("import_records")
      .select("*")
      .eq("id", upload_id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (fetchError || !importRecord) {
      return NextResponse.json(
        { error: "Import record not found" },
        { status: 404 }
      );
    }

    const resultObj = (importRecord.result && typeof importRecord.result === 'object' && !Array.isArray(importRecord.result))
      ? importRecord.result as Record<string, unknown>
      : {};
    const rawCsv = resultObj.raw_csv as string | undefined;
    if (!rawCsv) {
      return NextResponse.json(
        { error: "CSV data not found. Please re-upload the file." },
        { status: 400 }
      );
    }

    // Update status to processing
    await supabase
      .from("import_records")
      .update({
        status: "processing",
        progress: { step: "processing", processed: 0, total: 0 },
      })
      .eq("id", upload_id);

    // Parse CSV
    const records: Record<string, string>[] = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    // Build mapping lookup
    const mappingLookup = new Map<string, CSVColumnMapping>();
    for (const mapping of mappings) {
      mappingLookup.set(mapping.csv_column, mapping);
    }

    // =======================================================================
    // STEP 1: Parse all rows and collect people to process
    // =======================================================================
    const personMap = new Map<string, PersonToProcess>();
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      try {
        // Extract email
        const email = row[emailMapping.csv_column]?.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          errors.push(`Row ${i + 1}: Invalid or missing email`);
          continue;
        }

        // Extract system fields and custom data
        let firstName: string | null = null;
        let lastName: string | null = null;
        const customData: Record<string, unknown> = {};

        for (const [csvColumn, value] of Object.entries(row)) {
          const mapping = mappingLookup.get(csvColumn);
          if (!mapping || mapping.maps_to === "skip") continue;

          const trimmedValue = value?.trim();
          if (!trimmedValue) continue;

          if (mapping.maps_to === "email") {
            continue; // Already handled
          } else if (mapping.maps_to === "first_name") {
            firstName = trimmedValue;
          } else if (mapping.maps_to === "last_name") {
            lastName = trimmedValue;
          } else {
            // Custom data - handle comma-separated values as arrays
            if (trimmedValue.includes(",") && !trimmedValue.includes("@")) {
              customData[mapping.maps_to] = trimmedValue
                .split(",")
                .map((v) => v.trim())
                .filter((v) => v);
            } else {
              customData[mapping.maps_to] = trimmedValue;
            }
          }
        }

        const existing = personMap.get(email);
        if (existing) {
          const { merged } = mergeCustomData(existing.customData, customData);
          existing.customData = merged;
          if (!existing.firstName && firstName) existing.firstName = firstName;
          if (!existing.lastName && lastName) existing.lastName = lastName;
        } else {
          personMap.set(email, {
            email,
            firstName,
            lastName,
            customData,
            existingPerson: null,
          });
        }
      } catch (rowError) {
        errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : "Unknown error"}`);
      }
    }
    const peopleToProcess = Array.from(personMap.values());

    // =======================================================================
    // STEP 2: Fetch existing people in batch
    // =======================================================================
    const emails = peopleToProcess.map((c) => c.email);
    const { data: existingPeople } = await supabase
      .from("people")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .in("email", emails);

    const existingPersonMap = new Map<string, Person>();
    for (const person of existingPeople || []) {
      existingPersonMap.set(person.email, person as Person);
    }

    // Attach existing people
    for (const person of peopleToProcess) {
      person.existingPerson = existingPersonMap.get(person.email) || null;
    }

    // =======================================================================
    // STEP 3: Separate into creates and updates, check what actually changed
    // =======================================================================
    const peopleToCreate: PersonToProcess[] = [];
    const peopleToUpdate: Array<{
      person: PersonToProcess;
      merged: Record<string, unknown>;
    }> = [];

    for (const person of peopleToProcess) {
      if (!person.existingPerson) {
        peopleToCreate.push(person);
      } else {
        // Check if anything changed
        const { merged, changed } = mergeCustomData(
          person.existingPerson.custom_data || {},
          person.customData
        );

        const systemFieldsChanged =
          (person.firstName && person.firstName !== person.existingPerson.first_name) ||
          (person.lastName && person.lastName !== person.existingPerson.last_name);

        if (changed || systemFieldsChanged) {
          peopleToUpdate.push({ person, merged });
        }
      }
    }

    // =======================================================================
    // STEP 4: Generate embeddings in batches for new/updated people
    // =======================================================================
    const EMBEDDING_BATCH_SIZE = 100;
    let peopleCreated = 0;
    let peopleUpdated = 0;

    // Generate embeddings for people to create
    if (peopleToCreate.length > 0) {
      const createEmbeddingTexts = peopleToCreate.map((c) =>
        buildPersonEmbeddingText({
          email: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
          custom_data: c.customData,
        })
      );

      // Batch generate embeddings
      const createEmbeddings: number[][] = [];
      for (let i = 0; i < createEmbeddingTexts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = createEmbeddingTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await generateEmbeddings(batch);
        createEmbeddings.push(...embeddings);

        // Update progress
        await supabase
          .from("import_records")
          .update({
            progress: {
              step: "processing",
              processed: i + batch.length,
              total: peopleToProcess.length,
              message: `Generating embeddings (${i + batch.length}/${createEmbeddingTexts.length})...`,
            },
          })
          .eq("id", upload_id);
      }

      // Insert people in batches
      const INSERT_BATCH_SIZE = 50;
      for (let i = 0; i < peopleToCreate.length; i += INSERT_BATCH_SIZE) {
        const batch = peopleToCreate.slice(i, i + INSERT_BATCH_SIZE);
        const batchEmbeddings = createEmbeddings.slice(i, i + INSERT_BATCH_SIZE);

        const inserts = batch.map((c, idx) => ({
          workspace_id: ctx.workspaceId,
          email: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
          custom_data: c.customData as unknown as Json,
          sources: ["csv_upload"],
          source_ids: {} as unknown as Json,
          relationship_type: "other",
          embedding: JSON.stringify(batchEmbeddings[idx]),
        }));

        const { data: insertedPeople, error: insertError } = await supabase
          .from("people")
          .upsert(inserts, { onConflict: "workspace_id,email", ignoreDuplicates: true })
          .select("id");

        if (!insertError) {
          peopleCreated += insertedPeople?.length ?? 0;
        } else {
          errors.push(`Batch insert error: ${insertError.message}`);
        }
      }
    }

    // Generate embeddings for people to update
    if (peopleToUpdate.length > 0) {
      const updateEmbeddingTexts = peopleToUpdate.map(({ person, merged }) =>
        buildPersonEmbeddingText({
          ...(person.existingPerson as Person),
          first_name: person.firstName || person.existingPerson?.first_name,
          last_name: person.lastName || person.existingPerson?.last_name,
          custom_data: merged,
        })
      );

      // Batch generate embeddings
      const updateEmbeddings: number[][] = [];
      for (let i = 0; i < updateEmbeddingTexts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = updateEmbeddingTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await generateEmbeddings(batch);
        updateEmbeddings.push(...embeddings);
      }

      // Update people one by one (Supabase doesn't support bulk update with different values)
      for (let i = 0; i < peopleToUpdate.length; i++) {
        const { person, merged } = peopleToUpdate[i];
        const embedding = updateEmbeddings[i];

        const updateData: Record<string, unknown> = {
          custom_data: merged as unknown as Json,
          sources: Array.from(
            new Set([...(person.existingPerson?.sources || []), "csv_upload"])
          ),
          embedding: JSON.stringify(embedding),
        };

        if (person.firstName) updateData.first_name = person.firstName;
        if (person.lastName) updateData.last_name = person.lastName;

        const { error: updateError } = await supabase
          .from("people")
          .update(updateData)
          .eq("id", person.existingPerson!.id);

        if (!updateError) {
          peopleUpdated++;
        } else {
          errors.push(`Update error for ${person.email}: ${updateError.message}`);
        }
      }
    }

    // =======================================================================
    // STEP 5: Mark as completed
    // =======================================================================
    await supabase
      .from("import_records")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        progress: {
          step: "complete",
          processed: records.length,
          total: records.length,
          peopleCreated,
          peopleUpdated,
        },
        result: {
          people_created: peopleCreated,
          people_updated: peopleUpdated,
          errors,
        },
      })
      .eq("id", upload_id);

    const response: CSVProcessResponse = {
      success: true,
      people_created: peopleCreated,
      people_updated: peopleUpdated,
      errors,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("CSV process error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
