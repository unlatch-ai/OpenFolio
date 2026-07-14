import type { SearchResult, SearchScaleStatus } from "@openfolio/shared-types";
import type { SearchFilters } from "./store";

export interface EditorialSearchResult extends SearchResult {
  matchReason: "Exact words" | "Related wording" | "Person" | "Conversation title";
  direction: "You" | null;
}

export interface EditorialSearchRequest {
  text: string;
  limit?: number;
  filters: SearchFilters;
}

function dateBounds(date: SearchFilters["date"]) {
  if (date === "any") return null;
  const now = new Date();
  const year = date === "this-year" ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

export async function queryEditorialArchive(request: EditorialSearchRequest): Promise<EditorialSearchResult[]> {
  // Renderer adapter: the current bridge accepts text/limit only. New filter fields stay
  // isolated here until the backend contract lands; filtering remains deterministic locally.
  const rows = await window.openfolio.search.query({ text: request.text, limit: Math.max(request.limit ?? 40, 100) });
  const bounds = dateBounds(request.filters.date);
  const terms = request.text.toLowerCase().split(/\s+/).filter((term) => term.length > 2);

  return rows.filter((row) => {
    if (request.filters.type === "messages" && row.kind !== "message") return false;
    if (request.filters.type === "people" && row.kind !== "person") return false;
    if (request.filters.type === "conversations" && row.kind !== "thread") return false;
    if (request.filters.type === "all" && (row.kind === "note" || row.kind === "reminder")) return false;
    if (request.filters.personId && row.personId !== request.filters.personId) return false;
    if (request.filters.threadId && row.threadId !== request.filters.threadId && row.entityId !== request.filters.threadId) return false;
    if (bounds && (!row.occurredAt || row.occurredAt < bounds.start || row.occurredAt >= bounds.end)) return false;
    return true;
  }).slice(0, request.limit ?? 40).map((row) => {
    const haystack = `${row.title} ${row.snippet}`.toLowerCase();
    const exact = terms.some((term) => haystack.includes(term));
    return {
      ...row,
      matchReason: row.kind === "person" ? "Person" : row.kind === "thread" ? "Conversation title" : exact ? "Exact words" : "Related wording",
      direction: null,
    };
  });
}

export function groupSearchResults(results: SearchResult[]) {
  return results.reduce<Record<string, SearchResult[]>>((groups, result) => {
    groups[result.kind] = [...(groups[result.kind] ?? []), result];
    return groups;
  }, {});
}

export function describeSearchScale(status: SearchScaleStatus) {
  return status.recommendVectorIndex
    ? `${status.embeddedDocuments} embedded documents. Run the local benchmark before large-release testing.`
    : `${status.embeddedDocuments} embedded documents. Current local scan path is acceptable for this scale.`;
}

export function formatCitationMeta(result: SearchResult) {
  const source = result.sourceLabel || result.title || result.kind;
  const date = result.occurredAt
    ? new Date(result.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return [result.kind, result.title, source !== result.title ? source : null, date].filter(Boolean).join(" · ");
}

export function highlightSnippet(snippet: string, query: string) {
  const terms = query.trim().split(/\s+/).filter((term) => term.length > 2);
  if (!terms.length) return [{ text: snippet, match: false }];
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return snippet.split(pattern).filter(Boolean).map((text) => ({
    text,
    match: terms.some((term) => term.toLowerCase() === text.toLowerCase()),
  }));
}
