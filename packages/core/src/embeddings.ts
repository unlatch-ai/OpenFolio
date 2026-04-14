import type { SearchDocument } from "@openfolio/shared-types";

function append(lines: string[], label: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter(Boolean);
    if (filtered.length === 0) {
      return;
    }
    lines.push(`${label}: ${filtered.join(", ")}`);
    return;
  }

  lines.push(`${label}: ${String(value)}`);
}

export function buildPersonSearchContent(input: {
  displayName: string;
  primaryHandle: string | null;
  recentThreadTitles?: string[];
  recentMessages?: string[];
}) {
  const lines: string[] = [];
  append(lines, "Person", input.displayName);
  append(lines, "Handle", input.primaryHandle);
  append(lines, "Recent Threads", input.recentThreadTitles ?? []);
  append(lines, "Recent History", input.recentMessages ?? []);
  return lines.join("\n");
}

export function buildThreadSearchContent(input: {
  title: string;
  participantHandles: string[];
  messages: string[];
}) {
  const lines: string[] = [];
  append(lines, "Thread", input.title);
  append(lines, "Participants", input.participantHandles);
  append(lines, "Recent Messages", input.messages);
  return lines.join("\n");
}

export function buildMessageSearchContent(input: {
  title: string;
  body: string;
  participantHandles?: string[];
}) {
  const lines: string[] = [];
  append(lines, "Entry", input.title);
  append(lines, "Participants", input.participantHandles ?? []);
  append(lines, "Message", input.body);
  return lines.join("\n");
}

export function buildNoteSearchContent(input: {
  content: string;
  entityType: string;
}) {
  const lines: string[] = [];
  append(lines, "Note Type", input.entityType);
  append(lines, "Content", input.content);
  return lines.join("\n");
}

export function buildReminderSearchContent(input: {
  title: string;
  personName?: string | null;
  dueAt?: number | null;
}) {
  const lines: string[] = [];
  append(lines, "Reminder", input.title);
  append(lines, "For", input.personName);
  append(lines, "Due At", input.dueAt ? new Date(input.dueAt).toISOString() : null);
  return lines.join("\n");
}

export function normalizeDocumentForEmbedding(document: SearchDocument) {
  return [document.title, document.content].filter(Boolean).join("\n\n");
}
