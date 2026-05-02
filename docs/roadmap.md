# OpenFolio Roadmap

## Sprint 1: Reliable First Run + Search Confidence

Status: complete.

- Guided local setup for Messages permission, import, Contacts sync, and
  semantic index status.
- Background embedding queue with visible progress and retry entry points.
- Search/Ask palette polish: clearer modes, grouped results, local/BYOK status,
  and citation navigation.
- People profile actions: add notes, add reminders, search within a person, and
  jump from a person message back to its thread.
- Security pass on external URL opening and MCP status language.
- Replace placeholder tests with behavior tests for onboarding, URL safety, MCP
  semantics, and embedding accounting.

## Sprint 2: Scale and Correctness

Status: complete.

- Benchmark local vector search on large imported histories.
- Choose and integrate a local vector index if in-process vector scans become a
  user-visible bottleneck.
- Add import cancellation/retry and clearer failure recovery.
- Add deeper renderer interaction tests for setup, Settings, Search/Ask, and
  People workflows.
- Address GitHub dependency vulnerability reports.
- Document release hygiene, version checks, and notarization status.

## Sprint 3: Local Relationship Workspace

Status: in progress.

- Richer People research view with editable contact aliases, pinned notes,
  reminder completion, and stronger relationship summaries.
- Better thread navigation, pagination, and attachment affordances.
- Improve Ask answers with stronger citation formatting and source filtering.

## Deferred Commercial Layers

- Stripe billing and subscriptions.
- Hosted AI relay, usage quotas, and paid plan enforcement.
- Google Contacts and Gmail connector UI.
- Hosted/remote MCP.
- Cloud graph sync or raw Messages backup.
