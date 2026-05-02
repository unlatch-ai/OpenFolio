import type { SearchResult, SearchScaleStatus } from "@openfolio/shared-types";

export function groupSearchResults(results: SearchResult[]) {
  return results.reduce<Record<string, SearchResult[]>>((groups, result) => {
    const key = result.kind;
    groups[key] = [...(groups[key] ?? []), result];
    return groups;
  }, {});
}

export function describeSearchScale(status: SearchScaleStatus) {
  if (status.recommendVectorIndex) {
    return `${status.embeddedDocuments} embedded documents. Run the local benchmark before large-release testing.`;
  }

  return `${status.embeddedDocuments} embedded documents. Current local scan path is acceptable for this scale.`;
}

export function formatCitationMeta(result: SearchResult) {
  const source = result.sourceLabel || result.title || result.kind;
  const date = result.occurredAt
    ? new Date(result.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  return [result.kind, source, date].filter(Boolean).join(" · ");
}
