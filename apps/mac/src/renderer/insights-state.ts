import type { MessageHeatmapEntry, WrappedSummary } from "@openfolio/shared-types";

export type InsightsYearData = {
  wrapped: WrappedSummary;
  heatmap: MessageHeatmapEntry[];
};

export type InsightsYearCache = Record<number, InsightsYearData>;

export function getCachedInsightsYear(cache: InsightsYearCache, year: number) {
  return cache[year] ?? null;
}

export function getInsightsEmptyCopy(wrapped: WrappedSummary | null, year: number) {
  return wrapped
    ? {
        title: `No data for ${year}`,
        description: "Choose another year to see available relationship stats.",
        cardTitle: `No messages in ${year}`,
        cardDescription: "Use the year controls above to return to a year with imported messages.",
      }
    : {
        title: "Insights",
        description: "Import your messages to see your relationship stats.",
        cardTitle: "No data yet",
        cardDescription: "Import your iMessage history from Settings to unlock your Wrapped experience.",
      };
}
