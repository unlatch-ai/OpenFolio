/**
 * Contact deduplication logic for OpenFolio
 *
 * Provides deterministic matching (same email/phone), fuzzy name matching,
 * and merge operations for combining duplicate person records.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface DuplicateCandidate {
  personA: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  personB: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  confidence: number;
  reason: string;
}

/**
 * Compute Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Compute name similarity (0-1) using Levenshtein distance
 */
export function nameSimilarity(nameA: string, nameB: string): number {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Extract domain from email address
 */
function emailDomain(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/**
 * Find deterministic duplicate matches (same email or phone) within a workspace
 */
export async function findDeterministicMatches(
  workspaceId: string
): Promise<DuplicateCandidate[]> {
  const supabase = createAdminClient();
  const candidates: DuplicateCandidate[] = [];

  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name, email, phone, avatar_url")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (!people || people.length < 2) return candidates;

  // Find duplicate emails
  const emailMap = new Map<string, typeof people>();
  for (const p of people) {
    if (!p.email) continue;
    const key = p.email.toLowerCase();
    const existing = emailMap.get(key);
    if (existing) {
      existing.push(p);
    } else {
      emailMap.set(key, [p]);
    }
  }

  for (const [email, group] of emailMap) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        candidates.push({
          personA: group[i],
          personB: group[j],
          confidence: 0.95,
          reason: `Same email: ${email}`,
        });
      }
    }
  }

  // Find duplicate phones
  const phoneMap = new Map<string, typeof people>();
  for (const p of people) {
    if (!p.phone) continue;
    const key = p.phone.replace(/\D/g, "");
    const existing = phoneMap.get(key);
    if (existing) {
      existing.push(p);
    } else {
      phoneMap.set(key, [p]);
    }
  }

  for (const [, group] of phoneMap) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pairKey = [group[i].id, group[j].id].sort().join(":");
        const alreadyFound = candidates.some(
          (c) =>
            [c.personA.id, c.personB.id].sort().join(":") === pairKey
        );
        if (!alreadyFound) {
          candidates.push({
            personA: group[i],
            personB: group[j],
            confidence: 0.9,
            reason: `Same phone: ${group[i].phone}`,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Find fuzzy duplicate matches using name similarity and email domain matching
 */
export async function findFuzzyMatches(
  workspaceId: string
): Promise<DuplicateCandidate[]> {
  const supabase = createAdminClient();
  const candidates: DuplicateCandidate[] = [];

  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name, email, phone, avatar_url")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (!people || people.length < 2) return candidates;

  // Compare all pairs for fuzzy matches
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];

      const fullNameA = `${a.first_name || ""} ${a.last_name || ""}`.trim();
      const fullNameB = `${b.first_name || ""} ${b.last_name || ""}`.trim();

      if (!fullNameA || !fullNameB) continue;

      const similarity = nameSimilarity(fullNameA, fullNameB);

      // High name similarity
      if (similarity >= 0.85) {
        candidates.push({
          personA: a,
          personB: b,
          confidence: Math.min(similarity, 0.85),
          reason: `Similar names: "${fullNameA}" ~ "${fullNameB}"`,
        });
        continue;
      }

      // Same email domain + similar first name
      if (a.email && b.email) {
        const domainA = emailDomain(a.email);
        const domainB = emailDomain(b.email);
        if (
          domainA &&
          domainB &&
          domainA === domainB &&
          domainA !== "gmail.com" &&
          domainA !== "yahoo.com" &&
          domainA !== "hotmail.com" &&
          domainA !== "outlook.com"
        ) {
          const firstNameSim = nameSimilarity(
            a.first_name || "",
            b.first_name || ""
          );
          if (firstNameSim >= 0.8) {
            candidates.push({
              personA: a,
              personB: b,
              confidence: 0.7,
              reason: `Same company domain (${domainA}) + similar first name`,
            });
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Merge two person records, keeping the first and absorbing the second
 */
export async function mergePeople(
  keepId: string,
  mergeId: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  // Fetch both records
  const [keepResult, mergeResult] = await Promise.all([
    supabase
      .from("people")
      .select("*, person_tags(tag_id), social_profiles(*)")
      .eq("id", keepId)
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("people")
      .select("*, person_tags(tag_id), social_profiles(*)")
      .eq("id", mergeId)
      .eq("workspace_id", workspaceId)
      .single(),
  ]);

  if (!keepResult.data || !mergeResult.data) {
    return { success: false, error: "One or both people not found" };
  }

  const keep = keepResult.data;
  const merge = mergeResult.data;

  // Merge fields: prefer keep's values, fill in blanks from merge
  const updates: Record<string, unknown> = {};
  const fillableFields = [
    "email",
    "phone",
    "first_name",
    "last_name",
    "display_name",
    "bio",
    "location",
    "avatar_url",
  ] as const;

  for (const field of fillableFields) {
    if (!keep[field] && merge[field]) {
      updates[field] = merge[field];
    }
  }

  // Merge sources arrays
  const keepSources = (keep.sources as string[]) || [];
  const mergeSources = (merge.sources as string[]) || [];
  const combinedSources = [...new Set([...keepSources, ...mergeSources])];
  if (combinedSources.length > keepSources.length) {
    updates.sources = combinedSources;
  }

  // Merge source_ids
  const keepSourceIds = (keep.source_ids as Record<string, string>) || {};
  const mergeSourceIds = (merge.source_ids as Record<string, string>) || {};
  const combinedSourceIds = { ...mergeSourceIds, ...keepSourceIds };
  if (
    Object.keys(combinedSourceIds).length > Object.keys(keepSourceIds).length
  ) {
    updates.source_ids = combinedSourceIds;
  }

  // Merge custom_data
  const keepCustom = (keep.custom_data as Record<string, unknown>) || {};
  const mergeCustom = (merge.custom_data as Record<string, unknown>) || {};
  const combinedCustom = { ...mergeCustom, ...keepCustom };
  if (Object.keys(combinedCustom).length > Object.keys(keepCustom).length) {
    updates.custom_data = combinedCustom;
  }

  updates.updated_at = new Date().toISOString();

  // Update keep record
  if (Object.keys(updates).length > 1) {
    await supabase.from("people").update(updates).eq("id", keepId);
  }

  // Relink interaction_people
  await supabase
    .from("interaction_people")
    .update({ person_id: keepId })
    .eq("person_id", mergeId);

  // Relink notes
  await supabase
    .from("notes")
    .update({ person_id: keepId })
    .eq("person_id", mergeId);

  // Union person_tags (skip duplicates)
  const keepTagIds = new Set(
    (keep.person_tags || []).map((pt: { tag_id: string }) => pt.tag_id)
  );
  const mergeTagsToAdd = (merge.person_tags || [])
    .filter((pt: { tag_id: string }) => !keepTagIds.has(pt.tag_id))
    .map((pt: { tag_id: string }) => ({
      person_id: keepId,
      tag_id: pt.tag_id,
      workspace_id: workspaceId,
    }));

  if (mergeTagsToAdd.length > 0) {
    await supabase.from("person_tags").insert(mergeTagsToAdd);
  }

  // Union social_profiles (skip same platform)
  const keepPlatforms = new Set(
    (keep.social_profiles || []).map(
      (sp: { platform: string }) => sp.platform
    )
  );
  const mergeSocialsToAdd = (merge.social_profiles || [])
    .filter(
      (sp: { platform: string }) => !keepPlatforms.has(sp.platform)
    )
    .map(
      (sp: {
        platform: string;
        profile_url: string | null;
        username: string | null;
      }) => ({
        person_id: keepId,
        workspace_id: workspaceId,
        platform: sp.platform,
        profile_url: sp.profile_url,
        username: sp.username,
      })
    );

  if (mergeSocialsToAdd.length > 0) {
    await supabase.from("social_profiles").insert(mergeSocialsToAdd);
  }

  // Relink person_companies (skip duplicates)
  const { data: keepCompanies } = await supabase
    .from("person_companies")
    .select("company_id")
    .eq("person_id", keepId);

  const keepCompanyIds = new Set(
    (keepCompanies || []).map((pc: { company_id: string }) => pc.company_id)
  );

  await supabase
    .from("person_companies")
    .update({ person_id: keepId })
    .eq("person_id", mergeId)
    .not("company_id", "in", `(${[...keepCompanyIds].join(",")})`);

  // Delete remaining person_companies for mergeId (duplicates)
  await supabase
    .from("person_companies")
    .delete()
    .eq("person_id", mergeId);

  // Delete merge record
  await supabase
    .from("people")
    .delete()
    .eq("id", mergeId)
    .eq("workspace_id", workspaceId);

  return { success: true };
}
