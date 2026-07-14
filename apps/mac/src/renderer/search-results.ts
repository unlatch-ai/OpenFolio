import type { SearchMatchReason, SearchResult, SearchResultType, SearchScaleStatus } from "@openfolio/shared-types";
import type { SearchFilters } from "./store";

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
  const bounds = dateBounds(request.filters.date);
  const resultTypes: SearchResultType[] | undefined = request.filters.type === "all"
    ? undefined
    : [request.filters.type === "messages" ? "message" : request.filters.type === "people" ? "person" : "conversation"];
  const response = await window.openfolio.search.queryArchive({
    text: request.text,
    limit: request.limit ?? 40,
    resultTypes,
    personIds: request.filters.personId ? [request.filters.personId] : undefined,
    threadId: request.filters.threadId,
    dateRange: bounds ? { startAt: bounds.start, endAt: bounds.end } : undefined,
  });
  if (response.state === "error") throw new Error(response.error?.message || "Local search failed");
  return response.results;
}

export type EditorialSearchResult = SearchResult;

export function formatMatchReason(reason: SearchMatchReason) {
  if (reason === "exact_words") return "Exact words";
  if (reason === "related_wording") return "Related wording";
  if (reason === "conversation_title") return "Conversation title";
  return "Person";
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
