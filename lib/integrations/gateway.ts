import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Database } from "@/lib/supabase/database.types";
import { tasks } from "@trigger.dev/sdk";
import type { generateEmbeddings } from "@/src/trigger/generate-embeddings";
import type {
  SyncResult,
  SyncSummary,
  NormalizedPerson,
  NormalizedInteraction,
} from "./types";

/**
 * Process a SyncResult from any connector:
 * 1. Upsert people (dedup by email within workspace)
 * 2. Auto-create companies from company_name / email domain
 * 3. Link people to companies via person_companies
 * 4. Create social profiles
 * 5. Create interactions and link participants
 * 6. Trigger embedding generation
 */
export async function processSync(
  result: SyncResult,
  workspaceId: string
): Promise<SyncSummary> {
  const supabase = createAdminClient();
  const summary: SyncSummary = {
    peopleCreated: 0,
    peopleUpdated: 0,
    companiesCreated: 0,
    interactionsCreated: 0,
  };

  // Map email -> person ID for interaction linking
  const emailToPersonId = new Map<string, string>();

  const personEmbeddingPayloads: { payload: { entityType: string; entityId: string; workspaceId: string } }[] = [];
  const interactionEmbeddingPayloads: { payload: { entityType: string; entityId: string; workspaceId: string } }[] = [];

  // --- Process people ---
  for (const person of result.people) {
    const personResult = await upsertPerson(
      supabase,
      person,
      workspaceId,
      emailToPersonId
    );
    if (personResult.created) summary.peopleCreated++;
    else summary.peopleUpdated++;

    // Auto-create company if provided
    if (person.company_name) {
      const companyId = await ensureCompany(
        supabase,
        person.company_name,
        person.company_domain,
        workspaceId
      );
      if (companyId) {
        if (companyId.created) summary.companiesCreated++;
        await linkPersonCompany(
          supabase,
          personResult.id,
          companyId.id,
          workspaceId,
          person.job_title
        );
      }
    }

    // Create social profiles
    if (person.social_profiles) {
      for (const sp of person.social_profiles) {
        await supabase
          .from("social_profiles")
          .upsert(
            {
              person_id: personResult.id,
              platform: sp.platform,
              profile_url: sp.profile_url || null,
              username: sp.username || null,
              workspace_id: workspaceId,
            },
            { onConflict: "person_id,platform" }
          );
      }
    }

    if (personResult.id) {
      personEmbeddingPayloads.push({
        payload: { entityType: "person", entityId: personResult.id, workspaceId },
      });
    }
  }

  // --- Process interactions ---
  for (const interaction of result.interactions) {
    const interactionId = await createInteraction(
      supabase,
      interaction,
      workspaceId,
      emailToPersonId
    );
    if (interactionId) {
      summary.interactionsCreated++;
      interactionEmbeddingPayloads.push({
        payload: { entityType: "interaction", entityId: interactionId, workspaceId },
      });
    }
  }

  // Batch trigger embeddings (one request per entity type instead of N requests)
  try {
    if (personEmbeddingPayloads.length > 0) {
      await tasks.batchTrigger<typeof generateEmbeddings>(
        "generate-embeddings",
        personEmbeddingPayloads
      );
    }
    if (interactionEmbeddingPayloads.length > 0) {
      await tasks.batchTrigger<typeof generateEmbeddings>(
        "generate-embeddings",
        interactionEmbeddingPayloads
      );
    }
  } catch {
    // Non-critical: embeddings will be missing but data is saved
  }

  return summary;
}

async function upsertPerson(
  supabase: ReturnType<typeof createAdminClient>,
  person: NormalizedPerson,
  workspaceId: string,
  emailMap: Map<string, string>
): Promise<{ id: string; created: boolean }> {
  // Try to find existing by email
  if (person.email) {
    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", person.email)
      .single();

    if (existing) {
      // Update existing person
      const updateData: Record<string, unknown> = {};
      if (person.first_name) updateData.first_name = person.first_name;
      if (person.last_name) updateData.last_name = person.last_name;
      if (person.display_name) updateData.display_name = person.display_name;
      if (person.phone) updateData.phone = person.phone;
      if (person.bio) updateData.bio = person.bio;
      if (person.location) updateData.location = person.location;
      if (person.avatar_url) updateData.avatar_url = person.avatar_url;

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("people")
          .update(updateData as Database["public"]["Tables"]["people"]["Update"])
          .eq("id", existing.id);
      }

      emailMap.set(person.email, existing.id);
      return { id: existing.id, created: false };
    }
  }

  // Create new person
  const insertData: Record<string, unknown> = {
    workspace_id: workspaceId,
    email: person.email || null,
    phone: person.phone || null,
    first_name: person.first_name || "Unknown",
    last_name: person.last_name || null,
    display_name: person.display_name || null,
    bio: person.bio || null,
    location: person.location || null,
    avatar_url: person.avatar_url || null,
    sources: person.source ? [person.source] : [],
    source_ids: person.source_id
      ? { [person.source]: person.source_id }
      : {},
    custom_data: person.custom_data || {},
  };

  const { data: newPerson } = await supabase
    .from("people")
    .insert(insertData as Database["public"]["Tables"]["people"]["Insert"])
    .select("id")
    .single();

  const id = newPerson?.id || "";
  if (person.email && id) {
    emailMap.set(person.email, id);
  }
  return { id, created: true };
}

async function ensureCompany(
  supabase: ReturnType<typeof createAdminClient>,
  name: string,
  domain: string | undefined,
  workspaceId: string
): Promise<{ id: string; created: boolean } | null> {
  // Try to find by name first
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .single();

  if (existing) {
    return { id: existing.id, created: false };
  }

  // Create new company
  const { data: newCompany } = await supabase
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name,
      domain: domain || null,
    })
    .select("id")
    .single();

  if (newCompany) {
    return { id: newCompany.id, created: true };
  }
  return null;
}

async function linkPersonCompany(
  supabase: ReturnType<typeof createAdminClient>,
  personId: string,
  companyId: string,
  workspaceId: string,
  role?: string
) {
  await supabase.from("person_companies").upsert(
    {
      person_id: personId,
      company_id: companyId,
      workspace_id: workspaceId,
      role: role || null,
    },
    { onConflict: "person_id,company_id" }
  );
}

async function createInteraction(
  supabase: ReturnType<typeof createAdminClient>,
  interaction: NormalizedInteraction,
  workspaceId: string,
  emailMap: Map<string, string>
): Promise<string | null> {
  // Check for duplicate by source_id (uses UNIQUE index)
  if (interaction.source_id && interaction.source) {
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("source_integration", interaction.source)
      .eq("source_id", interaction.source_id)
      .single();

    if (existing) return null; // Skip duplicate
  }

  const { data: newInteraction } = await supabase
    .from("interactions")
    .insert({
      workspace_id: workspaceId,
      interaction_type: interaction.interaction_type,
      direction: interaction.direction || null,
      subject: interaction.subject || null,
      notes: interaction.content || null,
      occurred_at: interaction.occurred_at,
      duration_minutes: interaction.duration_minutes || null,
      source_url: interaction.source_url || null,
      source_integration: interaction.source || null,
      source_id: interaction.source_id || null,
      metadata: (interaction.metadata || {}) as Json,
    })
    .select("id")
    .single();

  if (!newInteraction) return null;

  // Link participants by email
  for (const email of interaction.participant_emails) {
    const personId = emailMap.get(email);
    if (personId) {
      await supabase.from("interaction_people").insert({
        interaction_id: newInteraction.id,
        person_id: personId,
        workspace_id: workspaceId,
      });
    }
  }

  return newInteraction.id;
}
