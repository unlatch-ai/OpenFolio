/**
 * Backfill embeddings for people/companies/interactions/notes.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts --workspace-id <uuid> [--tables people,companies,interactions,notes] [--batch-size 50] [--force] [--allow-remote]
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

type TableName = "people" | "companies" | "interactions" | "notes";

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    if (value === undefined) {
      args[key] = true;
    } else {
      args[key] = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const workspaceId = String(args["workspace-id"] || "");
const tablesArg = String(args["tables"] || "people,companies,interactions,notes");
const batchSize = Number(args["batch-size"] || 50);
const force = Boolean(args["force"]);
const allowRemote = Boolean(args["allow-remote"]);

if (!workspaceId || workspaceId === "undefined") {
  console.error("Missing --workspace-id <uuid>");
  process.exit(1);
}

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
if (!isLocal && !allowRemote) {
  console.error(
    `Refusing to run against non-local Supabase URL: ${supabaseUrl}. Use --allow-remote to override.`
  );
  process.exit(1);
}

const tables = tablesArg
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean) as TableName[];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function embeddingToText(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

async function backfillPeople() {
  let updated = 0;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("people")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (!force) {
      query = query.is("embedding", null);
    }

    const { data: people, error } = await query.range(
      offset,
      offset + batchSize - 1
    );

    if (error) throw error;
    if (!people || people.length === 0) break;

    const batch = people as Person[];
    const texts = batch.map((person) => buildPersonEmbeddingText(person));
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < batch.length; i += 1) {
      const person = batch[i];
      const embedding = embeddings[i];
      const { error: updateError } = await supabase
        .from("people")
        .update({ embedding: embeddingToText(embedding) })
        .eq("id", person.id);

      if (!updateError) updated += 1;
    }

    offset += people.length;
  }

  return updated;
}

async function backfillCompanies() {
  let updated = 0;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("companies")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (!force) {
      query = query.is("embedding", null);
    }

    const { data: companies, error } = await query.range(
      offset,
      offset + batchSize - 1
    );

    if (error) throw error;
    if (!companies || companies.length === 0) break;

    const batch = companies as Company[];
    const texts = batch.map((company) => buildCompanyEmbeddingText(company));
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < batch.length; i += 1) {
      const company = batch[i];
      const embedding = embeddings[i];
      const { error: updateError } = await supabase
        .from("companies")
        .update({ embedding: embeddingToText(embedding) })
        .eq("id", company.id);

      if (!updateError) updated += 1;
    }

    offset += companies.length;
  }

  return updated;
}

async function backfillInteractions() {
  let updated = 0;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("interactions")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (!force) {
      query = query.is("embedding", null);
    }

    const { data: interactions, error } = await query.range(
      offset,
      offset + batchSize - 1
    );

    if (error) throw error;
    if (!interactions || interactions.length === 0) break;

    const batch = interactions as Interaction[];
    const interactionIds = batch.map((i) => i.id);
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

    const texts = batch.map((interaction) =>
      buildInteractionEmbeddingText(interaction, participantsByInteraction.get(interaction.id))
    );
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < batch.length; i += 1) {
      const interaction = batch[i];
      const embedding = embeddings[i];
      const { error: updateError } = await supabase
        .from("interactions")
        .update({ embedding: embeddingToText(embedding) })
        .eq("id", interaction.id);

      if (!updateError) updated += 1;
    }

    offset += interactions.length;
  }

  return updated;
}

async function backfillNotes() {
  let updated = 0;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("notes")
      .select("*, people (first_name, last_name), companies (name)")
      .eq("workspace_id", workspaceId);
    if (!force) {
      query = query.is("embedding", null);
    }

    const { data: notes, error } = await query.range(
      offset,
      offset + batchSize - 1
    );

    if (error) throw error;
    if (!notes || notes.length === 0) break;

    const typedNotes = notes as Array<Note & {
      people: { first_name: string | null; last_name: string | null } | null;
      companies: { name: string } | null;
    }>;

    const texts = typedNotes.map((note) =>
      buildNoteEmbeddingText(note, note.people, note.companies)
    );
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < typedNotes.length; i += 1) {
      const note = typedNotes[i];
      const embedding = embeddings[i];
      const { error: updateError } = await supabase
        .from("notes")
        .update({ embedding: embeddingToText(embedding) })
        .eq("id", note.id);

      if (!updateError) updated += 1;
    }

    offset += notes.length;
  }

  return updated;
}

async function run() {
  const tableSet = new Set<TableName>(tables);
  const results: Record<string, number> = {};

  if (tableSet.has("people")) results.people = await backfillPeople();
  if (tableSet.has("companies")) results.companies = await backfillCompanies();
  if (tableSet.has("interactions")) results.interactions = await backfillInteractions();
  if (tableSet.has("notes")) results.notes = await backfillNotes();

  console.log("Backfill embeddings complete");
  console.log(results);
}

run().catch((err) => {
  console.error("Backfill embeddings failed:", err);
  process.exit(1);
});
