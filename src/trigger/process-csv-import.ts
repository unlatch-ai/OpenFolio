import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parse } from "csv-parse/sync";
import {
  buildPersonEmbeddingText,
  mergeCustomData,
} from "@/lib/embeddings";
import { generateEmbeddings } from "@/lib/openai";
import type { Person } from "@/types";
import type { Json } from "@/lib/supabase/database.types";

interface PersonToProcess {
  email: string;
  firstName: string | null;
  lastName: string | null;
  customData: Record<string, unknown>;
  existingPerson: Person | null;
}

const EMBEDDING_BATCH_SIZE = 100;
const INSERT_BATCH_SIZE = 50;

export const processCsvImport = schemaTask({
  id: "process-csv-import",
  schema: z.object({
    uploadId: z.string(),
    workspaceId: z.string(),
    mappings: z.array(
      z.object({
        csv_column: z.string(),
        maps_to: z.string(),
        is_system_field: z.boolean(),
      })
    ),
  }),
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5000 },
  run: async (payload) => {
    const { uploadId, workspaceId, mappings } = payload;
    const supabase = createAdminClient();

    // Fetch import record with raw CSV
    const { data: importRecord, error: fetchError } = await supabase
      .from("import_records")
      .select("*")
      .eq("id", uploadId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !importRecord) {
      throw new Error(`Import record not found: ${uploadId}`);
    }

    const resultObj =
      importRecord.result &&
      typeof importRecord.result === "object" &&
      !Array.isArray(importRecord.result)
        ? (importRecord.result as Record<string, unknown>)
        : {};
    const rawCsv = resultObj.raw_csv as string | undefined;

    if (!rawCsv) {
      await supabase
        .from("import_records")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          result: { error: "CSV data not found. Please re-upload the file." },
        })
        .eq("id", uploadId);
      return { success: false, error: "CSV data not found" };
    }

    // Mark as processing
    await supabase
      .from("import_records")
      .update({
        status: "processing",
        progress: { step: "processing", processed: 0, total: 0 },
      })
      .eq("id", uploadId);

    // Parse CSV
    const records: Record<string, string>[] = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    const emailMapping = mappings.find((m) => m.maps_to === "email");
    if (!emailMapping) {
      throw new Error("Email column mapping is required");
    }

    // Build mapping lookup
    const mappingLookup = new Map(mappings.map((m) => [m.csv_column, m]));

    // STEP 1: Parse all rows
    const personMap = new Map<string, PersonToProcess>();
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const email = row[emailMapping.csv_column]?.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          errors.push(`Row ${i + 1}: Invalid or missing email`);
          continue;
        }

        let firstName: string | null = null;
        let lastName: string | null = null;
        const customData: Record<string, unknown> = {};

        for (const [csvColumn, value] of Object.entries(row)) {
          const mapping = mappingLookup.get(csvColumn);
          if (!mapping || mapping.maps_to === "skip") continue;
          const trimmedValue = value?.trim();
          if (!trimmedValue) continue;

          if (mapping.maps_to === "email") {
            continue;
          } else if (mapping.maps_to === "first_name") {
            firstName = trimmedValue;
          } else if (mapping.maps_to === "last_name") {
            lastName = trimmedValue;
          } else {
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
          personMap.set(email, { email, firstName, lastName, customData, existingPerson: null });
        }
      } catch (rowError) {
        errors.push(
          `Row ${i + 1}: ${rowError instanceof Error ? rowError.message : "Unknown error"}`
        );
      }
    }

    const peopleToProcess = Array.from(personMap.values());

    // STEP 2: Batch-fetch existing people
    const emails = peopleToProcess.map((c) => c.email);
    const { data: existingPeople } = await supabase
      .from("people")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("email", emails);

    const existingPersonMap = new Map<string, Person>();
    for (const person of existingPeople || []) {
      if (person.email) existingPersonMap.set(person.email, person as Person);
    }
    for (const person of peopleToProcess) {
      person.existingPerson = existingPersonMap.get(person.email) || null;
    }

    // STEP 3: Separate creates/updates
    const peopleToCreate: PersonToProcess[] = [];
    const peopleToUpdate: Array<{ person: PersonToProcess; merged: Record<string, unknown> }> = [];

    for (const person of peopleToProcess) {
      if (!person.existingPerson) {
        peopleToCreate.push(person);
      } else {
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

    let peopleCreated = 0;
    let peopleUpdated = 0;

    // STEP 4a: Embed and insert new people
    if (peopleToCreate.length > 0) {
      const createEmbeddingTexts = peopleToCreate.map((c) =>
        buildPersonEmbeddingText({
          email: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
          custom_data: c.customData,
        })
      );

      const createEmbeddings: number[][] = [];
      for (let i = 0; i < createEmbeddingTexts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = createEmbeddingTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await generateEmbeddings(batch);
        createEmbeddings.push(...embeddings);

        // Fire-and-forget progress update (non-critical)
        void supabase
          .from("import_records")
          .update({
            progress: {
              step: "processing",
              processed: i + batch.length,
              total: peopleToProcess.length,
              message: `Generating embeddings (${i + batch.length}/${createEmbeddingTexts.length})...`,
            },
          })
          .eq("id", uploadId);
      }

      for (let i = 0; i < peopleToCreate.length; i += INSERT_BATCH_SIZE) {
        const batch = peopleToCreate.slice(i, i + INSERT_BATCH_SIZE);
        const batchEmbeddings = createEmbeddings.slice(i, i + INSERT_BATCH_SIZE);

        const inserts = batch.map((c, idx) => ({
          workspace_id: workspaceId,
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

    // STEP 4b: Embed and update existing people
    if (peopleToUpdate.length > 0) {
      const updateEmbeddingTexts = peopleToUpdate.map(({ person, merged }) =>
        buildPersonEmbeddingText({
          ...(person.existingPerson as Person),
          first_name: person.firstName || person.existingPerson?.first_name,
          last_name: person.lastName || person.existingPerson?.last_name,
          custom_data: merged,
        })
      );

      const updateEmbeddings: number[][] = [];
      for (let i = 0; i < updateEmbeddingTexts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = updateEmbeddingTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await generateEmbeddings(batch);
        updateEmbeddings.push(...embeddings);
      }

      for (let i = 0; i < peopleToUpdate.length; i++) {
        const { person, merged } = peopleToUpdate[i];
        const updateData: Record<string, unknown> = {
          custom_data: merged as unknown as Json,
          sources: Array.from(
            new Set([...(person.existingPerson?.sources || []), "csv_upload"])
          ),
          embedding: JSON.stringify(updateEmbeddings[i]),
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

    // STEP 5: Mark completed and clear raw CSV
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
      .eq("id", uploadId);

    return { success: true, people_created: peopleCreated, people_updated: peopleUpdated, errors };
  },
});
