import type { MessageDetail } from "@openfolio/shared-types";

export function filterPersonMessages(messages: MessageDetail[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return messages;
  }

  return messages.filter((message) => (message.body || "").toLowerCase().includes(normalized));
}
