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
- Dense People profiles with editable identity fields, aliases, related
  threads, paginated message search, pinned notes, reminder completion, and
  deterministic relationship summary cards.
- Thread reading supports stable older/newer pagination and displays imported
  attachment filename/type metadata.
- Ask citations include source labels, dates when available, navigation targets,
  and optional all/person/thread source filters.
- Hosted account sign-in is deferred in the Mac app. The renderer does not
  initialize a hosted Convex client by default.
- Local stdio MCP server and setup snippets for compatible assistants.
- GitHub Releases based Mac updater and signed local Mac packaging.
- Cancellable/retryable Messages import with clearer recovery state.
- Search scale reporting and a repeatable local benchmark command.

## Boundaries

- Raw Messages history stays local by default.
- Hosted account creation is optional and is not required for the local app.
- The local app should not open hosted connections unless a future hosted
  feature is explicitly enabled by the user.
- Hosted AI, billing, managed Google/Gmail connectors, cloud graph sync, and
  hosted/remote MCP are future work.
- No legacy local schema compatibility is required yet because there are no
  current users.

## Known gaps

- Search currently scans stored vectors in-process. The app now warns at larger
  embedded-document counts and includes `pnpm bench:search` for local benchmark
  runs. A vector index should be added once benchmark data shows user-visible
  latency.
- Renderer coverage includes workflow helper behavior for profile controls,
  navigation metadata, citations, and setup state. Full DOM interaction tests are
  still the next testing step once the app adopts a browser-like test
  environment.
- Dependency audit is reduced to a remaining low-severity advisory after pinned
  transitive overrides and the Electron 39 upgrade.
- The hosted package exists for future commercial boundaries but is not part of
  the local MVP path.
