# Editorial Archive Implementation Plan

Status: approved July 2026; implementation in progress
Inputs: [product-contract.md](./product-contract.md), [editorial-archive-design-system.md](./editorial-archive-design-system.md)

## Ground rules

- `packages/core` remains the canonical behavior layer.
- No screen generation or generated image assets are required.
- The signed/notarized `OpenFolio.app`, every Electron utility/native helper in its process tree, and the distributed MCP executable must make no Internet, LAN, loopback, DNS, or other socket connection and must not open HTTP(S) in another app.
- Do not claim zero-network from source inspection, code-only denial, CSP, a blocked-network run, or unit tests. The release claim requires complete artifact inspection plus PID-attributed zero-traffic observation of the signed artifact on real macOS.
- Exact retrieval must remain available when semantic retrieval is incomplete or unavailable.
- Do not add generated answers. Search results and Wrapped statements must be traceable to stored records or deterministic analytics.
- Website work stays marketing/docs/download-only.
- Obsidian is a later source. MCP is a later interface. Neither expands this implementation.
- New feature-specific styles live beside their feature (`*.css`) to keep the shared stylesheet and parallel file ownership stable.
- Use existing shadcn primitives first. Add shared primitives only in the foundation slice.
- An active dependency-remediation patch owns manifests and `pnpm-lock.yaml`. Slice 1 is code-only with respect to those files. Slice 2 may take manifest/lockfile/model-resource ownership only after that patch lands and the integrator reconciles its dependency graph.

## Slice 1 — Code-only offline policy and search contract

**Exclusive ownership**

- `packages/core/src/app.ts`
- `packages/core/src/ai.ts`
- `packages/core/src/db.ts`
- `packages/core/src/connectors.ts`
- `packages/mcp/src/**`
- `packages/shared-types/src/index.ts`
- `apps/mac/src/main.ts`
- `apps/mac/src/navigation.ts`
- `apps/mac/src/preload.ts`
- `apps/mac/src/updater.ts`
- `apps/mac/src/updater-state.ts`
- `apps/mac/native/permission-guide/main.swift`
- `apps/mac/native/AskForPermission/Sources/Panel/GuidePanelContentView.swift`
- new core/network contract tests
- new MCP hostile-environment/subprocess tests

**Work**

- Add immutable `production-deny-all` policy before app readiness/window creation and exact configured-loopback-only policy for development.
- Remove OpenAI/BYOK provider selection from Mac and MCP behavior; ignore inherited provider, proxy, Convex, and Hugging Face environment variables.
- Remove automatic release checks/downloads, Mac hosted auth/config, loopback callback server, connector credentials, HTTP(S) external-open IPC, cross-origin navigation handoff, and native-helper privacy links.
- Move/exclude Google/Gmail network connectors from the offline core production export graph.
- Force MCP to explicit offline-core construction, stdio only, no TCP listener, bounded result payloads, and hostile-environment tests; expose a disclosure requirement before any renderer copies client configuration.
- Preserve only verified local `x-apple.systempreferences:` navigation needed for permissions; all HTTP(S), WebSocket, FTP, arbitrary custom schemes, downloads, new windows, and permissions fail closed.
- Extend search input with result types, person IDs, thread ID, and date range.
- Extend result metadata with direction, exact source labels, timestamp, and deterministic match reason/score components needed by the renderer.
- Ensure scoped/date filters are applied before limiting/ranking.

**Acceptance**

- Policy tests deny production URL/scheme/network actions, validate IPC senders, and allow only the exact dev origin in development.
- Unit/subprocess tests with hostile environment variables cannot enable OpenAI, hosted auth, connectors, proxy routing, remote model behavior, or an MCP listener.
- No updater initialization or schedule remains, and every app/native-helper HTTP(S) handoff is removed.
- Search filter tests prove type/person/thread/date scopes and stable citation targets.
- No Mac renderer API exposes save/delete OpenAI key, hosted auth, or generated answer actions.
- MCP remains stdio-only, opens no listener, ignores network environment values, and its client privacy boundary is available to the Settings slice as local copy.
- This slice is an implementation prerequisite, not proof of the public zero-network claim.

## Slice 2 — Dependency closure, bundled model, and release resources

This slice starts only after the active dependency-remediation patch is merged/cherry-picked and its manifest/lockfile changes are accepted. The integrator records that base commit before assigning ownership.

**Exclusive ownership after that handoff**

- root `package.json` and `pnpm-lock.yaml`
- `apps/mac/package.json`
- `apps/mac/electron.vite.config.ts`
- `apps/mac/build/**`
- `packages/core/package.json`
- `packages/core/src/local-embeddings.ts`
- `.github/workflows/release-mac.yml`
- new `apps/mac/assets/models/**`
- new model manifest, model-card/license notices, and third-party notices
- new artifact/dependency/model packaging tests

**Work**

- Remove `electron-updater`, `openai`, hosted/auth, and network connector packages from the Mac/MCP production dependency closure after reconciling the remediation patch.
- Select an exact Transformers.js-compatible ONNX revision; pin every file by SHA-256 and record its upstream revision, model card, and redistribution license.
- Package model/tokenizer/config under `Contents/Resources/models/<model-id>/<revision>/`; resolve only through `process.resourcesPath`; disable remote models before pipeline construction.
- Fail closed to FTS on missing/hash-mismatched assets without a download, socket, hosted fallback, or environment-driven provider.
- Bundle all fonts, icons, scripts, in-app privacy copy, and migrations. Remove updater metadata consumers and inspect generated app/update YAML.
- Measure compressed artifact size, installed size, first-load RAM, and Intel/Apple Silicon behavior. Prototype App Sandbox without network client/server entitlements and record compatibility with Messages, Contacts, ONNX/JIT, and helpers.

**Acceptance**

- Clean production dependency graph and unpacked artifact scans find no forbidden network SDK/import/host, updater metadata consumer, remote asset, or unexpected entitlement in Mac/MCP closure.
- Empty HOME/cache packaging test loads the exact bundled model by verified hash and produces the expected vector dimension with network stubs set to throw.
- Missing/corrupt model test preserves FTS and reports semantic unavailability without attempting traffic.
- Exact model revision and every redistributed file pass legal/license/model-card review; this is a release blocker.
- The signed artifact contains one complete model copy per intended packaging architecture and all required local runtime libraries.

## Slice 3 — Token foundation and application shell

**Exclusive ownership**

- `packages/shared-tokens/tokens.css`
- `apps/mac/src/renderer/styles.css`
- `apps/mac/src/renderer/App.tsx`
- `apps/mac/src/renderer/store.ts`
- `apps/mac/src/renderer/components/AppSidebar.tsx`
- `apps/mac/src/renderer/components/ContactAvatar.tsx`
- `apps/mac/src/renderer/components/ui/**`
- new `apps/mac/assets/fonts/**`
- new shell/token tests

**Work**

- Implement all semantic tokens, local fonts, graphite shell, warm paper canvas, focus treatment, shared motion, and deterministic person colors.
- Replace view IDs with `search | people | conversations | wrapped | settings`; default to Search.
- Establish imports/routes for feature components without implementing their page content.
- Add shared Empty, Alert, Spinner, Field, InputGroup, ToggleGroup, Popover, and accessible Avatar primitives as needed.
- Implement compact sidebar behavior and local status language.

**Acceptance**

- Search is selected after setup and on a clean returning launch.
- Sidebar order and labels exactly match the product contract.
- No raw page hex values or remote font loads remain.
- Keyboard focus is visible across shell controls; sidebar works at 760px width and 200% text zoom.
- Token snapshot/contrast audit covers light canvas, dark canvas, and sidebar states.

## Slice 4 — Search and citation workflow

**Exclusive ownership**

- new `apps/mac/src/renderer/components/SearchView.tsx`
- `apps/mac/src/renderer/components/CommandPalette.tsx` (reduce to shortcut/focus adapter or remove)
- `apps/mac/src/renderer/search-results.ts`
- new `apps/mac/src/renderer/components/search.css`
- new Search renderer tests

**Work**

- Build pristine, typing, partial-index, results, no-results, error, and selected-citation states.
- Implement 180ms search-as-you-type, immediate Enter submit, query/filter session restoration, and `⌘K` focus behavior.
- Add type, person, conversation, and date filters against the new bridge contract.
- Render match reason, direction, source, exact timestamp, snippet markup, and evidence preview.
- Deep-link message results to exact Conversations citations and person/conversation results to canonical surfaces.

**Acceptance**

- The onboarding example query can reach an exact message and open it centered in Conversations.
- Semantic results are labeled as retrieval (`Related wording`), never an answer.
- Filters change the backend query, survive route round-trips, and can all be cleared.
- Screen reader output identifies result type, source, date, and selected state.
- No `Ask`, provider, model, AI sparkle, or generated-summary UI remains.

## Slice 5 — Onboarding and first-search success

**Exclusive ownership**

- `apps/mac/src/renderer/onboarding.ts`
- `apps/mac/src/renderer/import-jobs.ts`
- `apps/mac/src/renderer/components/OnboardingView.tsx`
- new `apps/mac/src/renderer/components/onboarding.css`
- `apps/mac/test/onboarding.test.ts`
- new onboarding interaction tests

**Work**

- Convert checklist setup to the five-stage sequence.
- Add in-app privacy disclosure, permission return/recheck, truthful progress rows, optional Contacts, and early exact-search entry.
- Persist completion without requiring Contacts or semantic completion.
- Add first-success callout only after an opened message citation.

**Acceptance**

- Required path is Messages access + enough imported records for exact search.
- Skip Contacts and incomplete semantic indexing still reach Search.
- Permission/import failure states preserve retry and never imply upload or data loss.
- First-success state appears once, only after a real citation opens.
- No onboarding action opens a privacy webpage.

## Slice 6 — People dossiers

**Exclusive ownership**

- `apps/mac/src/renderer/components/PeopleView.tsx`
- `apps/mac/src/renderer/people-profile.ts`
- new `apps/mac/src/renderer/components/people.css`
- People/profile tests

**Work**

- Make profile read-first and move editing into a titled secondary surface.
- Implement dense index, sorts, unknown-contact handling, dossier header, deterministic stats, message strata, conversation links, and person-scoped search.
- Collapse existing notes and visually de-emphasize migration-only reminders.

**Acceptance**

- Unknown handles remain searchable and intelligible.
- Every summary line is derived from existing profile fields/analytics and makes no causal or emotional inference.
- Person search opens the exact message citation in Conversations.
- Identity edit is keyboard accessible and not visible as a default grid of inputs.

## Slice 7 — Conversation evidence archive

**Exclusive ownership**

- `apps/mac/src/renderer/components/InboxView.tsx` (rename export/file if desired within this slice)
- new `apps/mac/src/renderer/components/conversations.css`
- Conversation renderer tests

**Work**

- Rename all user-facing Messages-page labels to Conversations.
- Replace chat mimicry with archive blocks, date rules, explicit participants, attachment documents, and stable paging.
- Implement citation centering/highlight plus surrounding-context distinction.
- Add related-person links and compact/narrow replacement navigation.

**Acceptance**

- No composer, reply affordance, delivery status, or message-bubble tail exists.
- Search deep links remain stable across older/newer pages and reload.
- Attachments never expose raw payload names in standard UI.
- Keyboard thread navigation and Escape/back behavior remain intact.

## Slice 8 — Wrapped annual artifact

**Exclusive ownership**

- `apps/mac/src/renderer/components/InsightsView.tsx` (rename export/file if desired within this slice)
- new `apps/mac/src/renderer/components/wrapped.css`
- Wrapped renderer tests

**Work**

- Rename Insights to Wrapped and rebuild hierarchy as annual editorial story.
- Use deterministic busiest-month opening, message strata, totals, top people, monthly arc, daily rhythm, and accessible heatmap.
- Remove gradients, decorative icon tiles, generic stat-card dashboard framing, and causal narrative.

**Acceptance**

- Every sentence can be reproduced from `WrappedSummary`/heatmap data.
- Zero-data years have a factual empty state.
- Charts expose text summaries and tabular/list equivalents.
- Year navigation works from earliest data year through current year without implying unavailable data.

## Slice 9 — Settings and privacy truth

**Exclusive ownership**

- `apps/mac/src/renderer/components/SettingsView.tsx`
- `apps/mac/src/renderer/update-labels.ts`
- `apps/mac/src/renderer/local-data-labels.ts`
- `apps/mac/src/renderer/diagnostics.ts`
- new `apps/mac/src/renderer/components/settings.css`
- Settings/update-label/diagnostics renderer tests

**Work**

- Reorder settings to the contract and remove Account/AI controls.
- Show Messages read-only state, local DB/index paths and health, bundled semantic status, Contacts, appearance, collapsed Advanced, diagnostics, version, and browser-independent manual replacement instructions.
- Render `https://github.com/unlatch-ai/OpenFolio/releases/latest` as selectable/copyable plain text, never a link, and use the proposed privacy/update copy verbatim where it fits.
- If MCP setup remains visible under Advanced, require the local client-boundary disclosure before enabling its Copy action.

**Acceptance**

- Settings accurately reports no app network connections.
- No update or documentation control opens a browser. Copying the canonical plain-text address is the only app action.
- There are no API key, hosted account, automatic update, download-progress, or model-download controls.
- MCP copy stays disabled until the user acknowledges that an external client receives private results and may apply its own cloud/retention policy.
- Technical paths/counts use mono; blocked states include a text remedy.

## Slice 10 — Website and public documentation

**Exclusive ownership**

- `apps/web/app/**`
- `apps/web/src/components/**`
- `apps/web/content/**`
- `README.md`
- `docs/current-state.md`
- website tests/build snapshots

**Work**

- Replace Wrapped-first/relationship-dashboard messaging with the exact search thesis and tagline.
- Rebuild the landing hierarchy around query → evidence → original conversation, then People, Wrapped, privacy, and open source.
- Remove AI/MCP from primary marketing, remove account-page links from the local path, and align privacy/getting-started docs with zero-network behavior.
- Update current-state only after each corresponding Mac behavior ships.

**Acceptance**

- The hero says what the product literally does in one screen.
- The site never says the installed app is 100% offline while documenting an in-app network feature.
- Website-vs-app network boundary is explicit.
- No OpenAI, hosted account, MCP, reminders, or relationship-health claim appears above open-source/developer detail.
- Production build and link checks pass.

## Integration order and gates

1. Kevin reviews the proposed product contract and visual decisions below.
2. Slice 1 lands code-only offline policy/search contracts without touching manifests or the lockfile.
3. The active dependency-remediation patch lands and is reconciled.
4. Slice 2 takes explicit manifest/lockfile/model-resource ownership and establishes the production dependency/artifact closure.
5. Slice 3 establishes navigation and design primitives.
6. Slices 4–9 may proceed independently after 1–3, using their exclusive feature files.
7. Slice 10 follows verified Mac behavior so public copy cannot outrun the product.
8. Source integration runs `pnpm typecheck`, `pnpm test`, `pnpm build`, keyboard-only, reduced-motion, 760×560, and 200%-text passes. These gates still do not prove zero network.

### Signed-artifact release gates

Before any public zero-network claim or release:

- Build the exact signed/notarized `.app`/DMG/ZIP on a clean runner; inspect ASAR, helpers, dylibs, entitlements, `Info.plist`, model manifest/hashes/licenses, generated updater metadata, remote strings/assets, and the full production dependency graph.
- On clean real macOS VMs/hardware for every supported OS/architecture, with empty app/model caches and no developer environment, observe the entire OpenFolio/MCP/helper process tree with PID-attributed packet, DNS, socket/listener, proxy, and process evidence.
- Exercise cold launch for at least 15 minutes, permission states, import, watcher changes, FTS and semantic search, model missing/corrupt cases, citation navigation, People, Conversations, Wrapped, Settings, diagnostics, sleep/wake, offline/online transitions, quit, every native helper, and MCP with hostile environment values.
- Repeat across IPv4/IPv6, proxy/PAC, captive portal, and hostile DNS. Attempted traffic fails the promise even when the network is unavailable. The reviewed app destination allowlist is empty.
- Verify on real macOS that Finder/DMG replacement preserves Application Support, pre-migration backup is readable, migration/rollback/future-schema refusal behave correctly, and low-disk/WAL-active cases do not delete the library.
- Archive machine-readable traces and signing/notarization verification. No code-only denial, CSP, source scan, or single monitoring tool substitutes for these gates.

No slice may edit another slice's exclusive files without handing ownership back to the integrator. Cross-slice needs should be expressed as a typed contract or a small follow-up owned by the original slice.

## Review decisions

Kevin approved the full-page Search interaction, `⌘K` focus/navigation behavior, filters, evidence preview, Instrument Serif + Geist roles, and the graphite-shell/warm-paper direction in July 2026. Cobalt `#4E5CFF` is an implementation placeholder until the first integrated visual review; it remains one semantic token so changing it does not fork the system. The first redesign ships the warm-paper content canvas and defers full dark-canvas mode.

The strict zero-network boundary is not a renderer-style choice: no socket activity and no HTTP(S) browser handoff are release requirements. One later, non-blocking product decision remains: whether Wrapped should eventually export share cards. Initial Wrapped stays view-only.

## Implementation-worker handoff

After Kevin's two reviews, start with Slice 1 without touching manifests/lockfile/model resources. Land and reconcile the active dependency-remediation patch, then assign Slice 2 ownership and complete the bundled-model/license/artifact closure. Only then implement the shared tokens/shell and Search end to end. Treat a source-opening citation—not a pretty result list—as the product-loop criterion, and treat signed-artifact PID-attributed real-macOS traffic evidence—not code-only denial—as the zero-network criterion.
