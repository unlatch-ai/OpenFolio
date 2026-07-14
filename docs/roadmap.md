# OpenFolio Roadmap

The current product direction is defined by:

- [Product contract](./product-contract.md)
- [Editorial Archive design system](./editorial-archive-design-system.md)
- [Implementation plan](./editorial-archive-implementation.md)

## Current milestone: Evidence-first search

Status: implemented on the current development branch; release verification pending.

- Make Search the default page and primary navigation item.
- Complete the loop from remembered description to ranked local result to the
  exact cited message in Conversations.
- Add person, conversation, result-type, and date filters to the local search
  contract.
- Preserve exact search while the local semantic index is incomplete or
  unavailable.
- Replace generated-answer/BYOK UI with retrieval and evidence.
- Enforce a genuinely zero-network Mac runtime: bundled local model, no hosted
  calls, no runtime model fetch, no automatic update check/download, and no
  HTTP(S) handoff to another app.

## Editorial Archive renderer

Status: implemented on the current development branch; visual review pending.

- Apply the graphite shell, warm paper canvas, oxidized-teal interaction system, local
  serif/sans/mono fonts, restrained rules, and message-strata motif.
- Rebuild onboarding around first successful search.
- Present People as dossiers and Conversations as the evidence archive.
- Rebuild Wrapped as a deterministic editorial annual artifact.
- Reorganize Settings around privacy truth and local control.

## Public surface alignment

Status: implemented on the current development branch; publish with the verified Mac release.

- Lead the website and README with `OpenFolio remembers who told you what.`
- Demonstrate query → evidence → original conversation.
- State the website/download network boundary separately from installed-app
  behavior.
- Keep Obsidian and MCP in later-source/interface documentation, not the initial
  pitch.

## Later, explicitly out of the initial milestone

- Obsidian as an additional local source.
- MCP as an additional local interface.
- Wrapped share-card exports, pending a product decision.
- Hosted services, accounts, billing, cloud sync, and managed connectors.
- Generated answers, if ever reintroduced, as a separately consented and
  source-cited product with an explicit network boundary.
