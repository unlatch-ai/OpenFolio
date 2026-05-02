import type { MessageDetail, Note, PersonAlias, Reminder } from "@openfolio/shared-types";

export function filterPersonMessages(messages: MessageDetail[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return messages;
  }

  return messages.filter((message) => (message.body || "").toLowerCase().includes(normalized));
}

export function normalizeAliasDraft(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function formatAliasLabel(alias: Pick<PersonAlias, "value" | "kind">) {
  const prefix = alias.kind === "handle" ? "Handle" : alias.kind === "name" ? "Name" : "Alias";
  return `${prefix}: ${alias.value}`;
}

export function orderProfileNotes(notes: Note[]) {
  return [...notes].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return (right.pinnedAt ?? right.createdAt) - (left.pinnedAt ?? left.createdAt);
  });
}

export function getReminderStatusLabel(reminder: Pick<Reminder, "status">) {
  return reminder.status === "done" ? "Done" : "Open";
}

export function getReminderToggleLabel(reminder: Pick<Reminder, "status">) {
  return reminder.status === "done" ? "Reopen" : "Done";
}
