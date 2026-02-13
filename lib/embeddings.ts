/**
 * Embedding utilities for OpenFolio
 *
 * Builds embedding text from various entity types using the "Column Name: value" format
 * to preserve semantic context for search.
 */

import { generateEmbedding } from "./openai";

// =============================================================================
// TEXT UTILITIES
// =============================================================================

/**
 * Format a column name for display in embedding text
 * Converts snake_case to Title Case
 */
function formatColumnName(key: string): string {
  return key
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Format a value for embedding text
 * Handles arrays, objects, and primitives
 */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((v) => v !== null && v !== undefined && v !== "");
    return filtered.length > 0 ? filtered.join(", ") : null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function addLine(parts: string[], label: string, value: unknown) {
  const formatted = formatValue(value);
  if (formatted) {
    parts.push(`${label}: ${formatted}`);
  }
}

// =============================================================================
// TEXT BUILDERS
// =============================================================================

/**
 * Build embedding text for a Person (contact in the user's network)
 */
export function buildPersonEmbeddingText(
  person: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    email?: string | null;
    phone?: string | null;
    bio?: string | null;
    location?: string | null;
    relationship_type?: string | null;
    custom_data?: Record<string, unknown>;
  },
  companies?: Array<{ name: string; role?: string | null }>,
  tags?: Array<{ name: string }>,
  recentInteractions?: Array<{ subject?: string | null; interaction_type?: string; occurred_at?: string }>
): string {
  const lines: string[] = [];

  const name = person.display_name || [person.first_name, person.last_name].filter(Boolean).join(' ');
  addLine(lines, 'Name', name);
  addLine(lines, 'Email', person.email);
  addLine(lines, 'Phone', person.phone);
  addLine(lines, 'Bio', person.bio);
  addLine(lines, 'Location', person.location);
  addLine(lines, 'Relationship', person.relationship_type);

  if (companies && companies.length > 0) {
    const companyStr = companies.map(c => c.role ? `${c.name} (${c.role})` : c.name).join(', ');
    addLine(lines, 'Companies', companyStr);
  }

  if (tags && tags.length > 0) {
    addLine(lines, 'Tags', tags.map(t => t.name).join(', '));
  }

  if (recentInteractions && recentInteractions.length > 0) {
    const interactionStr = recentInteractions
      .slice(0, 5)
      .map(i => `${i.interaction_type}: ${i.subject || 'untitled'}`)
      .join('; ');
    addLine(lines, 'Recent Interactions', interactionStr);
  }

  // Include custom_data fields
  if (person.custom_data) {
    for (const [key, value] of Object.entries(person.custom_data)) {
      if (value !== null && value !== undefined && value !== '') {
        addLine(lines, key, value);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build embedding text for a Company
 */
export function buildCompanyEmbeddingText(
  company: {
    name: string;
    domain?: string | null;
    industry?: string | null;
    location?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
  keyPeople?: Array<{ first_name?: string | null; last_name?: string | null; role?: string | null }>
): string {
  const lines: string[] = [];

  addLine(lines, 'Company Name', company.name);
  addLine(lines, 'Domain', company.domain);
  addLine(lines, 'Industry', company.industry);
  addLine(lines, 'Location', company.location);
  addLine(lines, 'Description', company.description);

  if (keyPeople && keyPeople.length > 0) {
    const peopleStr = keyPeople
      .map(p => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        return p.role ? `${name} (${p.role})` : name;
      })
      .join(', ');
    addLine(lines, 'Key People', peopleStr);
  }

  if (company.metadata) {
    for (const [key, value] of Object.entries(company.metadata)) {
      if (value !== null && value !== undefined && value !== '') {
        addLine(lines, key, value);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build embedding text for an Interaction (meeting, email, call, etc.)
 */
export function buildInteractionEmbeddingText(
  interaction: {
    interaction_type: string;
    direction?: string | null;
    subject?: string | null;
    content?: string | null;
    summary?: string | null;
    occurred_at?: string;
    source_integration?: string | null;
  },
  participants?: Array<{ first_name?: string | null; last_name?: string | null; role?: string | null }>
): string {
  const lines: string[] = [];

  addLine(lines, 'Type', interaction.interaction_type);
  addLine(lines, 'Direction', interaction.direction);
  addLine(lines, 'Subject', interaction.subject);
  addLine(lines, 'Date', interaction.occurred_at);
  addLine(lines, 'Source', interaction.source_integration);

  if (participants && participants.length > 0) {
    const participantStr = participants
      .map(p => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        return p.role ? `${name} (${p.role})` : name;
      })
      .join(', ');
    addLine(lines, 'Participants', participantStr);
  }

  // Use summary if available, otherwise truncated content
  if (interaction.summary) {
    addLine(lines, 'Summary', interaction.summary);
  } else if (interaction.content) {
    addLine(lines, 'Content', interaction.content.substring(0, 500));
  }

  return lines.join('\n');
}

/**
 * Build embedding text for a Note
 */
export function buildNoteEmbeddingText(
  note: {
    content: string;
  },
  person?: { first_name?: string | null; last_name?: string | null } | null,
  company?: { name: string } | null
): string {
  const lines: string[] = [];

  if (person) {
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
    addLine(lines, 'About Person', name);
  }

  if (company) {
    addLine(lines, 'About Company', company.name);
  }

  addLine(lines, 'Note', note.content);

  return lines.join('\n');
}

// =============================================================================
// EMBEDDING GENERATORS
// =============================================================================

/**
 * Generate and return embedding for a person
 */
export async function generatePersonEmbedding(
  person: Parameters<typeof buildPersonEmbeddingText>[0],
  companies?: Parameters<typeof buildPersonEmbeddingText>[1],
  tags?: Parameters<typeof buildPersonEmbeddingText>[2],
  recentInteractions?: Parameters<typeof buildPersonEmbeddingText>[3]
): Promise<number[]> {
  const text = buildPersonEmbeddingText(person, companies, tags, recentInteractions);
  return generateEmbedding(text);
}

/**
 * Generate and return embedding for a company
 */
export async function generateCompanyEmbedding(
  company: Parameters<typeof buildCompanyEmbeddingText>[0],
  keyPeople?: Parameters<typeof buildCompanyEmbeddingText>[1]
): Promise<number[]> {
  const text = buildCompanyEmbeddingText(company, keyPeople);
  return generateEmbedding(text);
}

/**
 * Generate and return embedding for an interaction
 */
export async function generateInteractionEmbedding(
  interaction: Parameters<typeof buildInteractionEmbeddingText>[0],
  participants?: Parameters<typeof buildInteractionEmbeddingText>[1]
): Promise<number[]> {
  const text = buildInteractionEmbeddingText(interaction, participants);
  return generateEmbedding(text);
}

/**
 * Generate and return embedding for a note
 */
export async function generateNoteEmbedding(
  note: Parameters<typeof buildNoteEmbeddingText>[0],
  person?: Parameters<typeof buildNoteEmbeddingText>[1],
  company?: Parameters<typeof buildNoteEmbeddingText>[2]
): Promise<number[]> {
  const text = buildNoteEmbeddingText(note, person, company);
  return generateEmbedding(text);
}

// =============================================================================
// CSV UTILITIES
// =============================================================================

/**
 * Build embedding text from raw CSV row data
 * Used during CSV import before full Person object exists
 */
export function buildEmbeddingTextFromCSVRow(
  row: Record<string, string>,
  mappings: { csv_column: string; maps_to: string }[]
): string {
  const parts: string[] = [];

  for (const mapping of mappings) {
    if (mapping.maps_to === "skip") continue;

    const value = row[mapping.csv_column];
    if (!value || value.trim() === "") continue;

    const displayKey = formatColumnName(mapping.maps_to);
    parts.push(`${displayKey}: ${value}`);
  }

  return parts.join("\n");
}

/**
 * Merge new custom_data into existing, preserving non-null values
 */
export function mergeCustomData(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): { merged: Record<string, unknown>; changed: boolean } {
  const merged = { ...existing };
  let changed = false;

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const existingValue = existing[key];
    if (JSON.stringify(existingValue) !== JSON.stringify(value)) {
      merged[key] = value;
      changed = true;
    }
  }

  return { merged, changed };
}
