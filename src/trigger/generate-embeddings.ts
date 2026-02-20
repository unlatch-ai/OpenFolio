import { task } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generatePersonEmbedding,
  generateCompanyEmbedding,
  generateInteractionEmbedding,
  generateNoteEmbedding,
} from "@/lib/embeddings";
import type { Json } from "@/lib/supabase/database.types";

function toObject(value: Json | null): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export const generateEmbeddings = task({
  id: "generate-embeddings",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000 },
  run: async (payload: {
    entityType: "person" | "company" | "interaction" | "note";
    entityId: string;
    workspaceId: string;
  }) => {
    const supabase = createAdminClient();
    const { entityType, entityId } = payload;

    switch (entityType) {
      case "person": {
        const { data: person } = await supabase
          .from("people")
          .select("*, person_companies(*, companies(*)), person_tags(tags(*))")
          .eq("id", entityId)
          .single();
        if (!person) return { skipped: true };

        const { data: recentInteractions } = await supabase
          .from("interaction_people")
          .select("interactions(subject, interaction_type, occurred_at)")
          .eq("person_id", entityId)
          .order("interactions(occurred_at)", { ascending: false })
          .limit(5);

        const embedding = await generatePersonEmbedding(
          {
            ...person,
            custom_data: toObject(person.custom_data),
          },
          person.person_companies?.map((pc: { companies: unknown }) => pc.companies as {
            name: string;
            role?: string | null;
          }) || [],
          person.person_tags?.map((pt: { tags: unknown }) => pt.tags as { name: string }) || [],
          recentInteractions?.map((ip: { interactions: unknown }) => ip.interactions as {
            subject?: string | null;
            interaction_type?: string;
            occurred_at?: string;
          }) || []
        );

        await supabase
          .from("people")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);

        return { generated: true, entityType, entityId };
      }

      case "company": {
        const { data: company } = await supabase
          .from("companies")
          .select("*, person_companies(people(first_name, last_name, email))")
          .eq("id", entityId)
          .single();
        if (!company) return { skipped: true };

        const embedding = await generateCompanyEmbedding(
          {
            ...company,
            metadata: toObject(company.metadata),
          },
          company.person_companies?.map((pc: { people: unknown }) => pc.people as {
            first_name?: string | null;
            last_name?: string | null;
            role?: string | null;
          }) || []
        );

        await supabase
          .from("companies")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);

        return { generated: true, entityType, entityId };
      }

      case "interaction": {
        const { data: interaction } = await supabase
          .from("interactions")
          .select("*, interaction_people(people(first_name, last_name))")
          .eq("id", entityId)
          .single();
        if (!interaction) return { skipped: true };

        const embedding = await generateInteractionEmbedding(
          interaction,
          interaction.interaction_people?.map((ip: { people: unknown }) => ip.people as {
            first_name?: string | null;
            last_name?: string | null;
            role?: string | null;
          }) || []
        );

        await supabase
          .from("interactions")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);

        return { generated: true, entityType, entityId };
      }

      case "note": {
        const { data: note } = await supabase
          .from("notes")
          .select("*, people(first_name, last_name), companies(name)")
          .eq("id", entityId)
          .single();
        if (!note) return { skipped: true };

        const embedding = await generateNoteEmbedding(note, note.people, note.companies);

        await supabase
          .from("notes")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);

        return { generated: true, entityType, entityId };
      }
    }
  },
});
