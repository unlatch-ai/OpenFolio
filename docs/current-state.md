# OpenFolio Current State

Last updated: May 2026

OpenFolio is a macOS-first, local-first app for searching and understanding
iMessage history. The current product surface is focused on a stable local MVP.

## Working local MVP surface

- Guided first-run setup for Messages access, local import, Apple Contacts sync,
  and semantic indexing.
- Read-only iMessage import from the local Messages database.
- Apple Contacts sync for resolving phone numbers and email handles to people.
- Local SQLite graph for people, threads, messages, notes, reminders, search
  documents, and derived analytics.
- Hybrid search over local full-text search and stored embeddings.
- Local embeddings through Transformers.js by default.
- BYOK OpenAI settings for Ask mode and optional OpenAI embeddings.
- Dense People profiles with contact details, related threads, recent messages,
  notes, reminders, and person-scoped message filtering.
- Local stdio MCP server and setup snippets for compatible assistants.
- GitHub Releases based Mac updater and signed local Mac packaging.

## Boundaries

- Raw Messages history stays local by default.
- Hosted account creation is optional and is not required for the local app.
- Hosted AI, billing, managed Google/Gmail connectors, cloud graph sync, and
  hosted/remote MCP are future work.
- No legacy local schema compatibility is required yet because there are no
  current users.

## Known gaps

- Search currently scans stored vectors in-process. This is acceptable for MVP
  testing, but large histories need measured benchmarks and likely a vector
  index such as sqlite-vec or another local ANN layer.
- Renderer coverage is still mostly state/helper focused. More UI interaction
  tests are needed as the app surface stabilizes.
- Dependency vulnerability cleanup remains open from GitHub security reporting.
- The hosted package exists for future commercial boundaries but is not part of
  the local MVP path.
