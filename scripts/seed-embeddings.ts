/**
 * Generate embeddings for local seed data (people, companies, interactions, notes).
 *
 * Usage:
 *   npx tsx scripts/seed-embeddings.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildPersonEmbeddingText,
  buildCompanyEmbeddingText,
  buildInteractionEmbeddingText,
  buildNoteEmbeddingText,
} from "../lib/embeddings";
import { generateEmbeddings } from "../lib/openai";
import type { Person, Company, Interaction, Note } from "../types";

config({ path: ".env.local" });
config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

if (!openaiKey) {
  console.error("Missing env var: OPENAI_API_KEY required to generate embeddings");
  process.exit(1);
}

const isLocal = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
if (!isLocal) {
  console.error(`Refusing to run against non-local Supabase URL: ${supabaseUrl}`);
  process.exit(1);
}

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const BATCH_SIZE = 50;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedPeopleEmbeddings() {
  const { data: people, error } = await supabase
    .from("people")
    .select("*")
    .eq("workspace_id", WORKSPACE_ID)
    .is("embedding", null);

  if (error) throw error;
  if (!people || people.length === 0) return 0;

  let updated = 0;
  for (let i = 0; i < people.length; i += BATCH_SIZE) {
    const batch = people.slice(i, i + BATCH_SIZE) as Person[];
    const texts = batch.map((person) => buildPersonEmbeddingText(person));
    const embeddings = await generateEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const person = batch[j];
      const embedding = embeddings[j];
      const { error: updateError } = await supabase
        .from("people")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", person.id);

      if (!updateError) updated++;
    }
  }

  return updated;
}

async function seedCompanyEmbeddings() {
  const { data: companies, error } = await supabase
    .from("companies")
    .select("*")
    .eq("workspace_id", WORKSPACE_ID)
    .is("embedding", null);

  if (error) throw error;
  if (!companies || companies.length === 0) return 0;

  let updated = 0;
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE) as Company[];
    const texts = batch.map((company) => buildCompanyEmbeddingText(company));
    const embeddings = await generateEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const company = batch[j];
      const embedding = embeddings[j];
      const { error: updateError } = await supabase
        .from("companies")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", company.id);

      if (!updateError) updated++;
    }
  }

  return updated;
}

async function seedInteractionEmbeddings() {
  const { data: interactions, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("workspace_id", WORKSPACE_ID)
    .is("embedding", null);

  if (error) throw error;
  if (!interactions || interactions.length === 0) return 0;

  const interactionIds = interactions.map((i) => i.id);
  const { data: interactionPeople } = await supabase
    .from("interaction_people")
    .select("interaction_id, role, person_id, people (first_name, last_name)")
    .in("interaction_id", interactionIds);

  const typedInteractionPeople = (interactionPeople || []) as Array<{
    interaction_id: string;
    role: string;
    person_id: string;
    people: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  }>;

  const participantsByInteraction = new Map<string, { first_name?: string | null; last_name?: string | null; role?: string | null }[]>();
  for (const ip of typedInteractionPeople) {
    const list = participantsByInteraction.get(ip.interaction_id) || [];
    const personList = Array.isArray(ip.people)
      ? ip.people
      : ip.people
        ? [ip.people]
        : [];

    for (const person of personList) {
      if (person) {
        list.push({ first_name: person.first_name, last_name: person.last_name, role: ip.role });
      }
    }
    participantsByInteraction.set(ip.interaction_id, list);
  }

  let updated = 0;
  for (let i = 0; i < interactions.length; i += BATCH_SIZE) {
    const batch = interactions.slice(i, i + BATCH_SIZE) as Interaction[];
    const texts = batch.map((interaction) =>
      buildInteractionEmbeddingText(interaction, participantsByInteraction.get(interaction.id))
    );
    const embeddings = await generateEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const interaction = batch[j];
      const embedding = embeddings[j];
      const { error: updateError } = await supabase
        .from("interactions")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", interaction.id);

      if (!updateError) updated++;
    }
  }

  return updated;
}

async function seedNoteEmbeddings() {
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*, people (first_name, last_name), companies (name)")
    .eq("workspace_id", WORKSPACE_ID)
    .is("embedding", null);

  if (error) throw error;
  if (!notes || notes.length === 0) return 0;

  const typedNotes = notes as Array<Note & {
    people: { first_name: string | null; last_name: string | null } | null;
    companies: { name: string } | null;
  }>;

  let updated = 0;
  for (let i = 0; i < typedNotes.length; i += BATCH_SIZE) {
    const batch = typedNotes.slice(i, i + BATCH_SIZE);
    const texts = batch.map((note) =>
      buildNoteEmbeddingText(note, note.people, note.companies)
    );
    const embeddings = await generateEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const note = batch[j];
      const embedding = embeddings[j];
      const { error: updateError } = await supabase
        .from("notes")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", note.id);

      if (!updateError) updated++;
    }
  }

  return updated;
}

async function run() {
  const peopleUpdated = await seedPeopleEmbeddings();
  const companiesUpdated = await seedCompanyEmbeddings();
  const interactionsUpdated = await seedInteractionEmbeddings();
  const notesUpdated = await seedNoteEmbeddings();

  console.log("Seed embeddings complete");
  console.log(`People updated: ${peopleUpdated}`);
  console.log(`Companies updated: ${companiesUpdated}`);
  console.log(`Interactions updated: ${interactionsUpdated}`);
  console.log(`Notes updated: ${notesUpdated}`);
}

run().catch((err) => {
  console.error("Seed embeddings failed:", err);
  process.exit(1);
});
