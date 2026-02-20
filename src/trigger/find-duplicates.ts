import { task } from "@trigger.dev/sdk";
import {
  findDeterministicMatches,
  findFuzzyMatches,
} from "@/lib/dedup";
import { createAdminClient } from "@/lib/supabase/admin";

export const findDuplicates = task({
  id: "find-duplicates",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5000 },
  run: async (payload: { workspaceId: string }) => {
    const supabase = createAdminClient();

    // Find all candidate pairs
    const [deterministic, fuzzy] = await Promise.all([
      findDeterministicMatches(payload.workspaceId),
      findFuzzyMatches(payload.workspaceId),
    ]);

    const allCandidates = [...deterministic, ...fuzzy];

    // Deduplicate candidates by pair (order-independent)
    const seen = new Set<string>();
    const unique = allCandidates.filter((c) => {
      const key = [c.personA.id, c.personB.id].sort().join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by confidence descending
    unique.sort((a, b) => b.confidence - a.confidence);

    // Store candidates in duplicate_candidates table
    if (unique.length > 0) {
      const rows = unique.map((c) => ({
        workspace_id: payload.workspaceId,
        person_a_id: c.personA.id,
        person_b_id: c.personB.id,
        confidence: c.confidence,
        reason: c.reason,
        status: "pending" as const,
      }));

      // Clear existing pending candidates for this workspace
      await supabase
        .from("duplicate_candidates" as never)
        .delete()
        .eq("workspace_id", payload.workspaceId)
        .eq("status", "pending");

      await supabase.from("duplicate_candidates" as never).insert(rows as never);
    }

    return {
      total: unique.length,
      deterministic: deterministic.length,
      fuzzy: fuzzy.length,
    };
  },
});
