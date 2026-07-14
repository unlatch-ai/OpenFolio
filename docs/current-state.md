# OpenFolio Current State

Last updated: July 2026

OpenFolio is a macOS app for finding a remembered detail in iMessage history,
checking the surrounding evidence, and returning to the original conversation.
Its installed app is designed to work without network access.

## Working product surface

- Search is the default route in `main`. It blends local full-text and semantic retrieval
  and supports person, conversation, date, and result-type filters.
- Every result exposes its match reason, surrounding messages, and an exact
  handoff to the cited message in Conversations.
- Exact search keeps working while semantic indexing is incomplete or the
  bundled model is unavailable.
- People are evidence dossiers, not relationship-health scores or CRM records.
- Conversations are the source archive. Wrapped is a deterministic annual
  reflection, not an engagement dashboard.
- First run covers Messages permission, read-only import, Contacts resolution,
  local indexing, and a first successful search.
- The pinned `all-MiniLM-L6-v2` ONNX model, tokenizer, configuration, hashes,
  and license files ship inside the Mac app. Runtime model download is denied.
- Production applies a deny-all network policy to the app process and blocks
  external HTTP(S) navigation. Automatic updates, hosted auth, BYOK AI, and
  remote connector controls are absent from the product UI.
- Updates are manual: quit the app and replace it in `/Applications`. The local
  library remains in `~/Library/Application Support/OpenFolio`.

## Product boundaries

- Search returns records and citations, never generated advice or an uncited
  answer.
- Obsidian is a possible later local source. MCP is a possible later local
  interface. Neither is part of the initial pitch.
- The marketing website and GitHub Releases are ordinary networked surfaces;
  the installed Mac app has the zero-network boundary.
- Hosted accounts, billing, cloud sync, managed connectors, and remote AI are
  outside this open-source milestone.

## Release gates still open

- Build the exact release with Developer ID signing and notarization.
- Inspect the final app, DMG, helpers, native libraries, entitlements, model
  manifest, licenses, and production dependency closure.
- Run PID-attributed traffic capture against the signed/notarized app and every
  helper. Source review and socket denial tests support the design but do not
  replace this proof.
- Run the full first-run and query-to-citation QA pass on a clean macOS account.
