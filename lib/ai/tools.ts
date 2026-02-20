/**
 * AI Tool Definitions for OpenFolio Personal CRM Agent
 *
 * All tools enforce workspace isolation.
 */

import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/openai";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSchemaColumns,
  groupSchemaByTable,
  searchPeopleInput,
  searchCompaniesInput,
  searchInteractionsInput,
  getPersonDetailsInput,
  getRelationshipInsightsInput,
  createNoteInput,
} from "@/lib/ai/schema";

// Context type for tools
export interface ToolContext {
  workspaceId: string;
  userId: string;
}

// =============================================================================
// SQL ANALYTICS TOOL
// =============================================================================

const ALLOWED_TABLES = [
  "people",
  "companies",
  "interactions",
  "tags",
  "notes",
  "social_profiles",
  "person_companies",
  "interaction_people",
  "person_tags",
  "company_tags",
] as const;

const ALLOWED_FUNCTIONS = [
  "list_table_columns",
  "list_json_keys",
] as const;

const ALLOWED_RELATIONS = [
  ...ALLOWED_TABLES,
  ...ALLOWED_FUNCTIONS,
] as const;

type AllowedRelation = (typeof ALLOWED_RELATIONS)[number];

const ORG_SCOPED_TABLES = [
  "people",
  "companies",
  "interactions",
  "tags",
  "notes",
  "social_profiles",
  "person_companies",
  "interaction_people",
  "person_tags",
  "company_tags",
] as const;

const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "create",
  "alter",
  "truncate",
  "grant",
  "revoke",
];

export function hasForbiddenKeyword(lowerQuery: string): boolean {
  return FORBIDDEN_KEYWORDS.some((kw) =>
    new RegExp(`\\b${kw}\\b`).test(lowerQuery)
  );
}

export function extractReferencedTables(normalizedQuery: string): string[] {
  const tableRegex =
    /\b(from|join)\s+([a-zA-Z_][\w]*)(?:\s*\.\s*([a-zA-Z_][\w]*))?/gi;
  const matches = [...normalizedQuery.matchAll(tableRegex)];
  return matches.map((m) => (m[3] ?? m[2]).toLowerCase()).filter(Boolean);
}

export function qualifyTableNames(query: string): string {
  let result = query;
  for (const table of ORG_SCOPED_TABLES) {
    const qualifyRegex = new RegExp(
      `\\b(from|join)\\s+${table}\\b(?!\\s*\\.)`,
      "gi"
    );
    result = result.replace(qualifyRegex, `$1 public.${table}`);
  }
  return result;
}

export function buildWorkspaceCTEs(
  query: string,
  referencedTables: string[],
  workspaceId: string
): string {
  let safeQuery = query;
  const cteParts: string[] = [];
  for (const table of ORG_SCOPED_TABLES) {
    if (referencedTables.includes(table)) {
      cteParts.push(
        `_ws_${table} AS (SELECT * FROM public.${table} WHERE workspace_id = '${workspaceId}')`
      );
      const replaceRegex = new RegExp(`\\bpublic\\.${table}\\b`, "gi");
      safeQuery = safeQuery.replace(replaceRegex, `_ws_${table}`);
    }
  }

  if (cteParts.length > 0) {
    safeQuery = `WITH ${cteParts.join(", ")} ${safeQuery}`;
  }
  return safeQuery;
}

export const executeSqlTool = tool({
  description:
    "Execute read-only SQL queries for analytics. Automatically filters to your workspace data. Useful for questions like 'How many people do I know at Google?' or 'Show my most recent interactions'.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "SQL SELECT query. Can query: people, companies, interactions, tags, notes, social_profiles, person_companies, interaction_people. DO NOT include workspace_id filters - they are added automatically."
      ),
    description: z
      .string()
      .describe("Brief description of what this query does (for the user)"),
  }),
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;
    const supabase = await createClient();

    try {
      const normalizedQuery = params.query.trim().replace(/;+\s*$/, "");
      const trimmedQuery = normalizedQuery.toLowerCase();
      if (!trimmedQuery.startsWith("select")) {
        return {
          error: "Only SELECT queries are allowed. This tool is read-only.",
          description: params.description,
        };
      }

      if (hasForbiddenKeyword(trimmedQuery)) {
        return {
          error:
            "Query contains forbidden keywords. Only read-only operations are permitted.",
          description: params.description,
        };
      }

      const referencedTables = extractReferencedTables(normalizedQuery);

      const disallowedTables = referencedTables.filter(
        (t) => !ALLOWED_RELATIONS.includes(t as AllowedRelation)
      );
      if (disallowedTables.length > 0) {
        return {
          error: `Query references disallowed tables: ${disallowedTables.join(
            ", "
          )}. Allowed tables/functions: ${ALLOWED_RELATIONS.join(", ")}`,
          description: params.description,
        };
      }

      const qualified = qualifyTableNames(normalizedQuery);
      const safeQuery = buildWorkspaceCTEs(qualified, referencedTables, workspaceId);

      const { data, error } = await supabase.rpc("execute_readonly_query", {
        query_text: safeQuery,
      });

      if (error) {
        return {
          error: `Query failed: ${error.message}`,
          description: params.description,
          executed_query: safeQuery,
        };
      }

      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;

      const payloadError =
        payload && typeof payload.error === "string" ? payload.error : null;
      if (payloadError) {
        return {
          error: `Query failed: ${payloadError}`,
          description: params.description,
          executed_query: safeQuery,
          detail:
            payload && typeof payload.detail === "string" ? payload.detail : undefined,
        };
      }

      const results = Array.isArray(payload?.results) ? payload?.results : [];
      const rowCount =
        payload && typeof payload.row_count === "number"
          ? (payload.row_count as number)
          : results.length;
      return {
        description: params.description,
        row_count: rowCount,
        results,
        note: "Results filtered to your workspace data only",
      };
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Unknown error executing query",
        description: params.description,
      };
    }
  },
});

export const getSchemaTool = tool({
  description:
    "Fetch the current public schema columns. Uses a short-lived cache to avoid repeated queries. Use before writing SQL.",
  inputSchema: z.object({
    force_refresh: z
      .boolean()
      .optional()
      .describe("Force refresh the cached schema"),
    table: z
      .string()
      .optional()
      .describe("Optional table name to filter results"),
  }),
  execute: async (params) => {
    const columns = await getSchemaColumns({
      forceRefresh: params.force_refresh,
    });
    const grouped = groupSchemaByTable(columns);

    if (params.table) {
      const table = params.table.toLowerCase();
      return {
        table,
        columns: grouped[table] ?? [],
      };
    }

    return {
      tables: Object.keys(grouped).sort(),
      columns_by_table: grouped,
      cached: params.force_refresh ? false : true,
    };
  },
});

// =============================================================================
// SEARCH TOOLS
// =============================================================================

export const searchPeopleTool = tool({
  description:
    "Search for people in the CRM by name, description, expertise, or other attributes. Uses semantic search for natural language queries.",
  inputSchema: searchPeopleInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const embedding = await generateEmbedding(params.query);
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc("match_people_text", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.3,
        match_count: params.limit,
        p_workspace_id: workspaceId,
      });

      if (error) {
        return { error: `Search failed: ${error.message}` };
      }

      let results = data || [];

      // Post-filter by relationship_type
      if (params.relationship_type) {
        results = results.filter(
          (r: { relationship_type: string }) =>
            r.relationship_type === params.relationship_type
        );
      }

      return {
        results: results.map((r: Record<string, unknown>) => ({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          display_name: r.display_name,
          email: r.email,
          phone: r.phone,
          location: r.location,
          bio: r.bio,
          relationship_type: r.relationship_type,
          relationship_strength: r.relationship_strength,
          last_contacted_at: r.last_contacted_at,
          similarity: r.similarity,
        })),
        count: results.length,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Search failed",
      };
    }
  },
});

export const searchCompaniesTool = tool({
  description:
    "Search for companies in the CRM by name, industry, description, or other attributes. Uses semantic search.",
  inputSchema: searchCompaniesInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const embedding = await generateEmbedding(params.query);
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc("match_companies_text", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.3,
        match_count: params.limit,
        p_workspace_id: workspaceId,
      });

      if (error) {
        return { error: `Search failed: ${error.message}` };
      }

      let results = data || [];

      if (params.industry) {
        results = results.filter(
          (r: { industry: string }) =>
            r.industry?.toLowerCase().includes(params.industry!.toLowerCase())
        );
      }

      if (params.location) {
        results = results.filter(
          (r: { location: string }) =>
            r.location?.toLowerCase().includes(params.location!.toLowerCase())
        );
      }

      return {
        results: results.map((r: Record<string, unknown>) => ({
          id: r.id,
          name: r.name,
          domain: r.domain,
          industry: r.industry,
          location: r.location,
          description: r.description,
          similarity: r.similarity,
        })),
        count: results.length,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Search failed",
      };
    }
  },
});

export const searchInteractionsTool = tool({
  description:
    "Search for interactions (meetings, calls, emails, etc.) by content, subject, or notes. Uses semantic search.",
  inputSchema: searchInteractionsInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const embedding = await generateEmbedding(params.query);
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc("match_interactions_text", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.3,
        match_count: params.limit,
        p_workspace_id: workspaceId,
      });

      if (error) {
        return { error: `Search failed: ${error.message}` };
      }

      let results = data || [];

      if (params.interaction_type) {
        results = results.filter(
          (r: { interaction_type: string }) =>
            r.interaction_type === params.interaction_type
        );
      }

      if (params.direction) {
        results = results.filter(
          (r: { direction: string }) => r.direction === params.direction
        );
      }

      return {
        results: results.map((r: Record<string, unknown>) => ({
          id: r.id,
          interaction_type: r.interaction_type,
          subject: r.subject,
          direction: r.direction,
          occurred_at: r.occurred_at,
          notes: r.notes,
          similarity: r.similarity,
        })),
        count: results.length,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Search failed",
      };
    }
  },
});

// =============================================================================
// DETAIL TOOLS
// =============================================================================

export const getPersonDetailsTool = tool({
  description:
    "Get detailed information about a specific person, including their companies, tags, social profiles, and recent interactions.",
  inputSchema: getPersonDetailsInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const supabase = createAdminClient();

      const { data: person, error } = await supabase
        .from("people")
        .select(
          "*, person_companies(*, companies:companies(id, name, domain, industry)), person_tags(tags:tags(id, name, color)), social_profiles(*), notes(*)"
        )
        .eq("id", params.person_id)
        .eq("workspace_id", workspaceId)
        .single();

      if (error || !person) {
        return { error: "Person not found" };
      }

      // Fetch recent interactions
      const { data: interactionLinks } = await supabase
        .from("interaction_people")
        .select("interactions:interactions(id, interaction_type, subject, occurred_at, direction, notes)")
        .eq("person_id", params.person_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const recentInteractions = (interactionLinks || [])
        .map((link: Record<string, unknown>) => link.interactions)
        .filter(Boolean);

      return {
        person,
        recent_interactions: recentInteractions,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to get person details",
      };
    }
  },
});

export const getRelationshipInsightsTool = tool({
  description:
    "Get relationship insights for a person or company — interaction frequency, last contact, communication patterns.",
  inputSchema: getRelationshipInsightsInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const supabase = createAdminClient();

      if (params.person_id) {
        // Get person with interaction stats
        const { data: person } = await supabase
          .from("people")
          .select("id, first_name, last_name, relationship_type, relationship_strength, last_contacted_at")
          .eq("id", params.person_id)
          .eq("workspace_id", workspaceId)
          .single();

        if (!person) {
          return { error: "Person not found" };
        }

        const { data: interactions } = await supabase
          .from("interaction_people")
          .select("interactions:interactions(id, interaction_type, occurred_at, direction)")
          .eq("person_id", params.person_id)
          .order("created_at", { ascending: false })
          .limit(50);

        const allInteractions = (interactions || [])
          .map((link: Record<string, unknown>) => link.interactions)
          .filter(Boolean) as Array<{
          interaction_type: string;
          occurred_at: string;
          direction: string;
        }>;

        // Compute insights
        const typeCounts: Record<string, number> = {};
        const directionCounts: Record<string, number> = {};
        for (const i of allInteractions) {
          typeCounts[i.interaction_type] = (typeCounts[i.interaction_type] || 0) + 1;
          if (i.direction) {
            directionCounts[i.direction] = (directionCounts[i.direction] || 0) + 1;
          }
        }

        return {
          person: {
            id: person.id,
            name: `${person.first_name} ${person.last_name || ""}`.trim(),
            relationship_type: person.relationship_type,
            relationship_strength: person.relationship_strength,
            last_contacted_at: person.last_contacted_at,
          },
          insights: {
            total_interactions: allInteractions.length,
            interaction_types: typeCounts,
            direction_breakdown: directionCounts,
            most_recent: allInteractions[0]?.occurred_at || null,
          },
        };
      }

      if (params.company_name) {
        // Find company by name
        const { data: company } = await supabase
          .from("companies")
          .select("id, name, industry, location")
          .eq("workspace_id", workspaceId)
          .ilike("name", `%${params.company_name}%`)
          .limit(1)
          .single();

        if (!company) {
          return { error: `Company "${params.company_name}" not found` };
        }

        // Get people at this company
        const { data: links } = await supabase
          .from("person_companies")
          .select("people:people(id, first_name, last_name, relationship_strength, last_contacted_at)")
          .eq("company_id", company.id);

        const people = (links || [])
          .map((link: Record<string, unknown>) => link.people)
          .filter(Boolean) as Array<{
          id: string;
          first_name: string;
          last_name: string;
          relationship_strength: number;
          last_contacted_at: string;
        }>;

        return {
          company,
          people_count: people.length,
          people: people.map((p) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name || ""}`.trim(),
            relationship_strength: p.relationship_strength,
            last_contacted_at: p.last_contacted_at,
          })),
        };
      }

      return { error: "Provide either person_id or company_name" };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to get insights",
      };
    }
  },
});

// =============================================================================
// ACTION TOOLS
// =============================================================================

export const createNoteTool = tool({
  description:
    "Create a note for a person or company. Use this when the user asks you to remember something about a contact.",
  inputSchema: createNoteInput,
  execute: async (params, { experimental_context }) => {
    const { workspaceId } = experimental_context as ToolContext;

    try {
      const supabase = createAdminClient();

      const insertData: Database["public"]["Tables"]["notes"]["Insert"] = {
        content: params.content,
        workspace_id: workspaceId,
      };

      if (params.person_id) {
        insertData.person_id = params.person_id;
      }
      if (params.company_id) {
        insertData.company_id = params.company_id;
      }

      const { data, error } = await supabase
        .from("notes")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        return { error: `Failed to create note: ${error.message}` };
      }

      return {
        success: true,
        note: data,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to create note",
      };
    }
  },
});

// =============================================================================
// TOOL REGISTRY
// =============================================================================

export const openfolioTools = {
  getSchema: getSchemaTool,
  executeSql: executeSqlTool,
  searchPeople: searchPeopleTool,
  searchCompanies: searchCompaniesTool,
  searchInteractions: searchInteractionsTool,
  getPersonDetails: getPersonDetailsTool,
  getRelationshipInsights: getRelationshipInsightsTool,
  createNote: createNoteTool,
};

export type OpenFolioTools = typeof openfolioTools;
