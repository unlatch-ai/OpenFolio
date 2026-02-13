import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { z } from "zod";

// =============================================================================
// AI TOOL INPUT SCHEMAS
// =============================================================================

export const searchPeopleInput = z.object({
  query: z.string().describe("Search query — name, description, expertise, etc."),
  tags: z.array(z.string()).optional().describe("Filter by tag names"),
  relationship_type: z.string().optional(),
  company: z.string().optional().describe("Filter by company name"),
  limit: z.number().default(10),
});

export const searchCompaniesInput = z.object({
  query: z.string().describe("Search query — company name, industry, description"),
  industry: z.string().optional(),
  location: z.string().optional(),
  limit: z.number().default(10),
});

export const searchInteractionsInput = z.object({
  query: z.string().describe("Search query — subject, notes, content"),
  interaction_type: z.string().optional(),
  direction: z.string().optional(),
  person_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().default(10),
});

export const getPersonDetailsInput = z.object({
  person_id: z.string().uuid(),
});

export const getRelationshipInsightsInput = z.object({
  person_id: z.string().uuid().optional(),
  company_name: z.string().optional(),
});

export const createNoteInput = z.object({
  person_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  content: z.string().min(1),
});

type ColumnRow =
  Database["public"]["Functions"]["list_table_columns"]["Returns"][number];

type SchemaCache = {
  fetchedAt: number;
  columns: ColumnRow[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function getCache(): SchemaCache | null {
  const globalAny = globalThis as typeof globalThis & {
    __ofSchemaCache?: SchemaCache;
  };
  return globalAny.__ofSchemaCache ?? null;
}

function setCache(cache: SchemaCache) {
  const globalAny = globalThis as typeof globalThis & {
    __ofSchemaCache?: SchemaCache;
  };
  globalAny.__ofSchemaCache = cache;
}

export async function getSchemaColumns(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh ?? false;
  const cached = getCache();
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return cached.columns;
  }

  const supabase = await createClient();
  let { data, error } = await supabase.rpc("list_table_columns");
  if (error) {
    const message = error.message || "";
    if (
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("does not exist")
    ) {
      await supabase.rpc("reload_pgrst_schema");
      const retry = await supabase.rpc("list_table_columns");
      data = retry.data;
      error = retry.error;
    }
  }
  if (error) {
    throw new Error(error.message);
  }

  const columns = (data ?? []) as ColumnRow[];
  setCache({ fetchedAt: Date.now(), columns });
  return columns;
}

export function groupSchemaByTable(columns: ColumnRow[]) {
  const grouped: Record<string, ColumnRow[]> = {};
  for (const col of columns) {
    if (!grouped[col.table_name]) {
      grouped[col.table_name] = [];
    }
    grouped[col.table_name].push(col);
  }
  return grouped;
}
