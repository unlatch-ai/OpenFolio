export const HOSTED_BOUNDARY = {
  excludes: [
    "raw_messages",
    "default_graph_sync",
    "automatic_message_backup"
  ],
  capabilities: [
    "billing",
    "hosted_ai",
    "managed_google_sync",
    "managed_microsoft_sync",
    "future_sync"
  ]
} as const;

export { api } from "../convex/_generated/api.js";
export * from "./client";
