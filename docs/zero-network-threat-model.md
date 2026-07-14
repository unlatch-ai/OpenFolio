# Zero-network threat model and implementation plan

Status: audit only, 2026-07-13. No runtime or dependency changes are included in this pass.

## Decision

The proposed promise is **not true of the current packaged app**:

> OpenFolio never makes network requests. To update, download the newest version and replace the app. Your private library remains on this Mac.

Today a signed build checks GitHub Releases 12 seconds after launch and every six hours, downloads updates automatically, downloads its embedding model on first use, can send queries and indexed document text to OpenAI, and can launch network destinations in the default browser. The repository also contains Google/Gmail clients, hosted Convex/auth code, and an MCP process whose behavior can become networked through inherited `OPENAI_API_KEY` configuration.

The target is feasible only if zero-network is an invariant of the packaged Mac application and its bundled helpers, not a preference or settings toggle. Development, the website, the release pipeline, a user's browser, and an external MCP client need explicit separate boundaries.

## 1. Promise and threat model

### Exact promise boundary

For a notarized production `OpenFolio.app`, from process launch until every process in its bundle exits:

- OpenFolio, its Electron renderer/main/utility processes, and its bundled Contacts and Setup helpers make no outbound or inbound Internet, LAN, loopback, DNS, UDP, or other socket connections.
- The app does not open a URL in another application. Manual update and documentation instructions may display a copyable URL, but the user opens it independently.
- All runtime assets, including the embedding model, fonts, icons, scripts, documentation needed in-app, and migrations, are inside the signed app bundle or its local Application Support directory before use.
- Messages, Contacts, the derived SQLite graph, search text, embeddings, credentials left by older versions, diagnostics, and usage events are never transmitted by the app.
- Replacing `OpenFolio.app` does not replace or delete `~/Library/Application Support/OpenFolio/`; the next version migrates the database in place after making a local backup.

The promise does **not** claim that these separate systems are offline:

- `openfolio.ai` and its Convex account page are ordinary networked websites.
- GitHub Actions, signing/notarization, and publishing are networked build/release activities, not installed-app runtime behavior.
- A browser the user independently opens to download an update is outside the app's process boundary.
- The local MCP server uses stdio and must itself remain offline, but an external MCP client may transmit tool arguments/results under that client's own policy. This is a privacy boundary that must be disclosed at setup time.
- macOS may independently perform certificate, trust, update, or telemetry traffic. Runtime tests must attribute traffic by PID/process tree rather than promising that the whole Mac is silent.

Threat actors and failures in scope include accidental SDK defaults, a dependency update restoring telemetry/update/model downloads, remote content in the renderer, malicious content trying navigation, inherited environment variables, an MCP host exfiltrating returned message data, and release packaging omitting a required local model and causing a runtime fallback. A compromised signed build or compromised macOS is outside this promise, but reproducible artifact inspection and signing checks reduce that risk.

## 2. Outbound-capable inventory

The inventory distinguishes code existence from reachability in the packaged app.

| Surface | Current behavior and evidence | Packaged reachability | Required disposition |
| --- | --- | --- | --- |
| GitHub auto-update | `apps/mac/src/main.ts:523-527` initializes the updater on every ready app. `apps/mac/src/updater.ts:33-42,81-88` enables automatic downloads, checks after 12 seconds, and repeats every six hours. `apps/mac/src/updater.ts:91-115` checks and installs; `:139-187` downloads and prompts. GitHub publish metadata is configured at `apps/mac/package.json:77-85`. | Direct, automatic | Remove updater initialization/API/UI and eventually `electron-updater`; ship no `app-update.yml`/`latest-mac.yml` consumer. |
| Transformers.js model hub | The Mac app enables local embeddings at `apps/mac/src/main.ts:38`. First search/index operation reaches `packages/core/src/app.ts:67-73,93-95,165-180,216-231`. `packages/core/src/local-embeddings.ts:48-69` dynamically imports Transformers.js, sets a cache, explicitly permits remote models, and calls `pipeline()` for `Xenova/all-MiniLM-L6-v2`. | Direct on first embedding use or background indexing | Bundle a pinned model, force remote models off, set a bundle-local model path, verify hashes before load, and fail closed to FTS if assets are absent. |
| OpenAI answers | Stored key or inherited `OPENAI_API_KEY` selects OpenAI at `apps/mac/src/main.ts:147-160`; Ask calls core at `:683-697`. `packages/core/src/ai.ts:102-140` sends the question plus retrieved local snippets to the Responses API. | User-configurable, and environment-configurable | Remove BYOK from the zero-network Mac product and prevent environment variables from changing runtime policy. Keep any networked AI in a separate product/process with a different promise. |
| OpenAI embeddings | Settings can enable it at `apps/mac/src/main.ts:699-707`. Search and dirty-document sync call embedding at `packages/core/src/app.ts:93-95,173-195`. `packages/core/src/ai.ts:35-63,66-99` sends query text or batches of full normalized documents. | User-configurable | Remove from the packaged app dependency and API closure. A toggle is insufficient because it preserves executable network capability. |
| Renderer subresources | Production renderer CSP is local-only: `apps/mac/src/renderer/index.html:6` has `connect-src 'self'`, `font-src 'self'`, and `img-src 'self' data:`. CSS imports are package-local at `apps/mac/src/renderer/styles.css:1-2`. | No identified production remote subresource | Preserve CSP and add a main-process request deny. CSP does not cover Node/main-process clients. |
| Renderer navigation / browser launch | `apps/mac/src/main.ts:479-493` routes allowed new windows and cross-origin navigation to `shell.openExternal`. Allowed destinations include OpenFolio, GitHub, Google, all Convex subdomains, and auth loopback at `apps/mac/src/navigation.ts:20-50`. Onboarding opens privacy docs (`apps/mac/src/renderer/components/OnboardingView.tsx:219-225`) and Settings opens GitHub release notes (`SettingsView.tsx:420-433`). | User-triggered; another process makes the request | Deny all HTTP(S) navigation and remove external-open IPC. Render essential privacy/update text locally and show copyable, non-clickable URLs. Keep `x-apple.systempreferences:` handling as a non-network system action after verifying it cannot escape to HTTP(S). |
| Native Setup helper | The helper embeds and opens the privacy URL at `apps/mac/native/permission-guide/main.swift:4,53-56,115-117`; the vendored UI has the same behavior at `apps/mac/native/AskForPermission/Sources/Panel/GuidePanelContentView.swift:227`. | User-triggered; another process makes the request | Remove the network button/URL and include local privacy copy. Audit the compiled helper, not only the chosen source list. |
| Hosted config/auth scaffolding in Mac | Release builds inject Convex/site environment values at `.github/workflows/release-mac.yml:15-24`. Main constructs and exposes config plus loopback auth plumbing at `apps/mac/src/main.ts:43-49,242-267,351-423,438-449,715-729`. It opens a loopback listener but no current renderer code initiates hosted sign-in. | Config and listener API present; no Convex client instantiated by current renderer | Remove cloud/auth/config/credential bridge from the Mac entry and stop injecting hosted endpoints into the Mac build. Remove protocol registration and loopback server. |
| Convex hosted client | `packages/hosted/src/client.ts:14-41` constructs `ConvexHttpClient` when configured and queries Convex. The Mac package does not import `@openfolio/hosted`; `apps/mac/src/renderer/App.tsx:95-149` only reads local IPC config despite stale Convex comments. | Not currently in Mac runtime closure | Preserve physical/package separation and add a dependency-graph test forbidding hosted imports from Mac/core/MCP. |
| Google OAuth / account | Web account code constructs a Convex realtime client and starts Google auth at `apps/web/app/account/page.tsx:12-23,89-94`; hosted auth config registers Google at `packages/hosted/convex/auth.ts:1-40`. Mac navigation currently allows these hosts, but no current Mac UI calls `beginAuthSession`. | Website only today; allowlist/scaffolding exists in Mac | Remove Mac auth scaffolding and describe account as website-only, outside the offline app. |
| Google Contacts API | `packages/core/src/connectors.ts:56-96` fetches `people.googleapis.com` with a bearer token. | Exported core code, but not invoked by current Mac UI; Mac sync uses Apple Contacts at `apps/mac/src/main.ts:617-672` | Move network connectors out of canonical offline core or exclude them from the offline build/export graph. Do not rely on UI reachability. |
| Gmail API | `packages/core/src/connectors.ts:148-167,203-246` fetches Gmail profile, listing, and message metadata. | Exported core code, but no current Mac sync invocation | Same as Google Contacts: hosted/network package only, absent from the signed offline artifact. |
| MCP stdio | Server transport is stdio at `packages/mcp/src/mcp-server.ts:179-181`; setup text correctly says the client starts it and there is no background server (`packages/mcp/src/service.ts:1-15`). Tool results contain search/profile/thread/message data (`mcp-server.ts:20-102`). | Local stdio, deliberately launched by external client | Keep stdio only; remove environment-driven AI networking; disclose that returned private data enters the client and may leave the Mac according to that client's settings. |
| MCP inherited OpenAI behavior | MCP creates `new OpenFolioCore()` at `packages/mcp/src/mcp-server.ts:6-8`. Core automatically adopts inherited `OPENAI_API_KEY` at `packages/core/src/app.ts:37-54`; MCP `search` then calls embedding at `mcp-server.ts:20-41`, which can call OpenAI (`packages/core/src/ai.ts:35-63`). CLI `ask` can also send retrieved context (`packages/mcp/src/cli.ts:23-30`). | Direct if the launching client supplies/inherits an OpenAI key | Construct an explicit offline core policy, ignore network-related environment variables, and add subprocess tests with hostile env values. |
| Electron/Chromium defaults | BrowserWindow uses sandboxed renderer but no network enforcement at `apps/mac/src/main.ts:451-477`. There is no `session.webRequest` deny, permission handler, `crashReporter.start`, Sentry, telemetry client, or explicit Chromium background-network policy in repository source. Hardened runtime entitlements allow JIT/unsigned executable memory/library-validation exceptions (`apps/mac/build/entitlements.mac.plist:5-10`) but do not enable App Sandbox or deny network. | Unknown incidental behavior until observed on signed artifact | Add defense in depth and perform cold-start signed-artifact traffic tests. Decide whether App Sandbox without network client/server entitlements is compatible with Messages/Contacts access. |
| Development renderer | `apps/mac/src/main.ts:465-473` loads `ELECTRON_RENDERER_URL`; normal Electron/Vite development therefore uses localhost HTTP/HMR and DevTools can be enabled at `:475-477`. | Development only | State that the public promise applies to packaged production. In development, allow only loopback dev-server traffic and still deny external destinations. Test both modes separately. |
| Local auth callback | `apps/mac/src/main.ts:369-423` binds an ephemeral `127.0.0.1` HTTP server. It is a listener, not an outbound Internet request, but conflicts with the stronger no-sockets enforcement boundary. | Only when IPC is called | Remove with hosted auth scaffolding. |
| Contacts and permission helpers | Contacts helper uses local `Contacts` APIs and writes JSON (`apps/mac/native/contacts-bridge.swift:78-99,101-168`). Build scripts only invoke local compiler/signing tools (`apps/mac/native/contacts-bridge.build.sh:9-18`, `permission-guide/build.sh:11-34`). System Settings URLs at `apps/mac/src/main.ts:287-295,617-623` are local OS navigation. | Local, except privacy links above | Retain local permission operations; runtime-test both helpers and inspect linked frameworks/strings in the shipped binaries. |
| Website remote behavior | The web account page is intentionally networked as above. `apps/web/app/layout.tsx:3-8` uses `next/font/google` (normally fetched at build and self-hosted in the built site). The website has GitHub download/navigation links such as `apps/web/src/components/navbar.tsx:19-26`. Unused component source also contains remote model logos/blob assets and fetch-capable UI; it is not imported into the current landing route. | Website, not app | Make the website/app boundary explicit. Audit the deployed web bundle separately; do not use website runtime behavior as evidence for the app promise. |
| Signing, notarization, publishing | Release workflow installs dependencies, signs/notarizes via Apple credentials, and publishes to GitHub (`.github/workflows/release-mac.yml:47-73`). Package version/tag matching is enforced at `:37-45`. | Build/release only | Keep networked release operations outside runtime. Add model manifest/license checks and offline artifact tests before publish. Inspect final DMG/ZIP contents and update metadata. |

No explicit crash-reporting or product telemetry initialization was found. `packages/core/src/analytics.ts` is local SQL analytics, not telemetry. Absence in source is not proof about Chromium/OS runtime defaults, so signed-artifact observation remains a release gate.

## 3. Production versus development

Packaged production loads `renderer/index.html` from the app bundle (`apps/mac/src/main.ts:465-473`), gets the local-only CSP, and currently enables `electron-updater` because `app.isPackaged` is true (`apps/mac/src/updater.ts:33-42`). It therefore has no renderer dev-server traffic but does have automatic GitHub and model-hub traffic.

Development loads the Vite URL and may open DevTools. It does not run the updater because `app.isPackaged` is false, but localhost HTTP/WebSocket HMR is expected, model downloads and OpenAI remain possible, and developer tools/extensions can add traffic. Development must use an explicit `development-loopback` policy; production must use `production-deny-all`. A test or environment flag must never weaken the packaged policy.

The website and Convex deployment are separate networked products. The current website statement that indexing happens “without sending a single byte to the cloud” (`README.md:42-46`) is incompatible with the same document's BYOK and model auto-download behavior (`README.md:32-34,103`). All public claims need to switch atomically with implementation.

## 4. Enforcement architecture

Use mutually reinforcing layers:

1. **Compile/package-time capability removal.** The Mac dependency closure must not contain `electron-updater`, `openai`, Convex/auth, Google/Gmail connectors, or a remote-model fallback. Move network-capable adapters to hosted/network-specific packages. Dependency-remediation owns manifest/lockfile edits, so coordinate this phase with that worktree rather than changing them here.
2. **Explicit runtime policy before app readiness.** Install the production deny policy before creating windows or initializing core. Cancel every Chromium request except local packaged resources. Deny HTTP(S), WebSocket, FTP, and arbitrary custom schemes; validate IPC sender frames. Disable navigation/window creation and do not call `shell.openExternal` for network URLs.
3. **Cover main/utility/helper processes.** Chromium `webRequest` alone does not cover Node `fetch`, `http`, `https`, `net`, `tls`, `dns`, `dgram`, native libraries, or child processes. The primary guarantee comes from removing those call paths and, if macOS compatibility permits, signing the app with App Sandbox while omitting network client/server entitlements. Verify Full Disk Access, Contacts TCC, SQLite, ONNX, spawned helpers, and Electron JIT under that sandbox before adopting it. If App Sandbox is incompatible, document the limitation and use artifact scanning plus PID-attributed runtime tests as the enforceable release gate; do not describe a JS monkey-patch as a security boundary.
4. **Fail closed.** Missing/corrupt model assets produce local FTS-only behavior and a local diagnostic. They never trigger download, OAuth, or hosted fallback. Inherited environment variables cannot enable providers.
5. **Artifact policy gate.** Scan the unpacked `.app`/ASAR and native binaries for forbidden hosts, URL schemes, network SDKs, updater metadata, and unexpected entitlements. Check the complete production dependency graph, not source imports alone.
6. **No toggle.** A “Network Lock” preference would leave executable network paths and regression risk. The offline binary always enforces the invariant. Any future connected edition must have a distinct bundle ID/name, build target, disclosure, and tests.

Chromium switches that reduce background networking may be added as defense in depth, but they are version-specific and not substitutes for request denial or OS enforcement.

## 5. Bundled model strategy

- Select one exact Transformers.js-compatible ONNX artifact and tokenizer/config set, pin upstream revision and SHA-256 for every file, and store a generated manifest plus upstream license/model-card notices in the repository/release inputs.
- Package assets under `Contents/Resources/models/<model-id>/<revision>/`; resolve only that path through `process.resourcesPath`. Set Transformers.js to local-only (`allowRemoteModels = false`, explicit local model path/local-files-only behavior) before constructing a pipeline.
- Verify the manifest during CI packaging and optionally once at first launch. A missing/hash-mismatched model disables semantic search and preserves FTS; it must not reach the Hugging Face Hub.
- Measure the actual chosen artifact. The repository says approximately 23 MB (`README.md:103`), while code requests `dtype: "fp32"` (`packages/core/src/local-embeddings.ts:66-69`); those may refer to different ONNX variants. Record uncompressed `.app`, compressed DMG/ZIP, installed footprint, peak extraction, first-load RAM, and Intel/Apple Silicon behavior before committing to a number.
- A model is architecture-independent, so a universal app should include one copy where packaging permits. ONNX native runtime binaries remain architecture-specific.
- Verify, do not assume, the license for the exact model revision and every redistributed tokenizer/config file. Preserve attribution and third-party notices. Also confirm Transformers.js/ONNX redistribution terms for the shipped versions. License and model-card review is a release blocker.
- Model updates ship only in a new full app download. Treat model/version changes like schema changes: version the embedding metadata, invalidate/rebuild derived embeddings locally, preserve source data, and state the added download/install size in release notes.
- Current packaging does not list model resources (`apps/mac/package.json:63-76`) and Transformers.js is only a core devDependency (`packages/core/package.json:17-23`). A clean packaged build must prove both runtime library and assets are present; current source/config does not establish that.

## 6. Manual update and data preservation

Replace the updater UI with a static local About panel:

1. Show installed version and: “OpenFolio does not check for updates or connect to the Internet.”
2. Show a copyable plain-text canonical download location, not a clickable link.
3. User independently downloads the signed/notarized DMG/ZIP in a browser, verifies publisher/signature instructions, quits OpenFolio, and replaces `/Applications/OpenFolio.app`.
4. On next launch, the new binary opens the same database at `~/Library/Application Support/OpenFolio/openfolio.sqlite` (`packages/core/src/db.ts:35,142-149`). App replacement does not touch that directory.
5. Before any schema change, the database checkpoints WAL and copies database/WAL/SHM to `.../OpenFolio/backups/` (`packages/core/src/db.ts:151-190`), then runs migration in a transaction (`:192-206`). A newer unsupported schema refuses to open instead of resetting (`:161-165`).

Implementation should add a release migration fixture test, backup integrity/open test, failed-migration restore instructions, and retention/disk-space policy. Never implement update by deleting Application Support. Clarify uninstall separately: deleting only the app preserves the library; deleting Application Support intentionally erases it. Verify replacement, downgrade refusal, failed migration, low disk, WAL-active migration, and moving the app between `/Applications` and a user Applications directory on real macOS.

## 7. MCP/client disclosure

MCP setup must require an explicit action and show this before copying configuration:

> OpenFolio's MCP server reads your local library and returns matching names, messages, notes, and relationship data to the MCP client you configure. OpenFolio uses local stdio and makes no network requests. The client may send tool requests or results to its own cloud service. Review that client's privacy and retention settings before enabling it.

Label each tool with the maximum data it can return. Search returns snippets; person profile can return aliases, stats, recent messages, notes, and reminders; thread returns participants and message bodies. Provide a local activity log of client tool names/timestamps without private payloads. Consider a default-redacted/minimum-data tool set and per-client database copy only as later privacy work; neither changes the need for disclosure.

The MCP executable itself belongs in the zero-network test boundary. It must ignore `OPENAI_API_KEY`, proxy variables, and hosted configuration, instantiate an explicit offline core, expose stdio only, and never start a TCP listener. “Local MCP” must not be phrased as “data cannot leave the Mac,” because the client controls what happens after receipt.

## 8. Proof and automated tests

### Unit/static gates

- Policy tests: production denies every URL/scheme including loopback; development allows only the exact configured loopback origin. Navigation, `window.open`, downloads, permissions, and external-open IPC fail closed.
- Core tests: offline construction ignores hostile `OPENAI_API_KEY`, Convex, proxy, and Hugging Face env values. Search/Ask/indexing with a missing model never invokes injected `fetch` and falls back locally.
- Model tests: run with an empty temporary HOME/cache and network stubs that throw; load the bundled fixture by hash and produce the expected vector dimension.
- MCP subprocess tests: launch with hostile env values, call every tool over stdio, assert no socket APIs/listeners and expected bounded outputs.
- Dependency/artifact scan: forbid network packages/imports/host strings in Mac/MCP production closure; inspect ASAR, helpers, dylibs, entitlements, `Info.plist`, update YAML, and remote assets.
- Migration tests: open each supported old fixture, assert pre-migration backup is independently readable and source records survive; assert future schema refusal and rollback on injected failure.

### Packaged integration/runtime gate

Run the exact signed/notarized `.app` on clean macOS VMs for each supported OS and architecture, with empty OpenFolio/Hugging Face caches and no developer environment:

1. Install a deny/logging proxy and a packet/socket monitor capable of PID attribution. Clear DNS caches where the harness permits. Record the entire OpenFolio process tree, helpers, Electron utilities, and spawned children.
2. Observe cold launch for at least 15 minutes, then exercise onboarding, Messages/Contacts permission states, import, watcher changes, FTS/semantic search, Ask, Insights, settings, diagnostics, model-missing/corrupt cases, sleep/wake, offline/online transitions, and app quit.
3. Assert zero DNS lookups, socket opens/listeners, HTTP(S), QUIC/UDP, WebSocket, LAN discovery, and loopback traffic from that process tree. If loopback is retained for a justified non-production harness, it must not exist in production.
4. Launch every bundled helper and the MCP server separately and repeat. Launch MCP with a cloud-backed client only for disclosure validation; distinguish client traffic from server traffic by PID.
5. Repeat behind IPv4/IPv6, system proxy/PAC, captive portal, and hostile DNS. A passing “no Internet available” test is insufficient because attempted traffic still violates the promise.
6. Save machine-readable traces and fail release on any unattributed packet/socket. Establish a reviewed allowlist of **zero** app destinations.

Useful macOS evidence sources may include `lsof -i`, `nettop`, `tcpdump`/BPF, Endpoint Security or a trusted network monitor, and proxy logs. Tool choice must be validated against Electron helper PIDs and QUIC; one tool alone is not proof.

## 9. Phased implementation and ownership

### Phase 0: freeze the contract

Owner: product/security/docs. Adopt the exact boundary above. Decide whether external browser launching is forbidden (recommended: yes), whether the MCP server is distributed with the app, and whether a separate connected edition will ever exist. Update public claims only when the matching artifact passes.

### Phase 1: remove first-party runtime paths

Owner: `apps/mac` and `packages/core`; coordinate manifests/lockfile with dependency-remediation.

- Replace updater state/API/UI with manual-update copy; remove updater initialization and GitHub release opening.
- Remove Mac cloud/auth/config, connector credentials, BYOK settings, OpenAI provider selection, external HTTP(S) navigation, protocol registration, and loopback callback server.
- Move Google/Gmail adapters out of offline core exports.
- Remove privacy web links from both Setup helper source paths and embed local disclosure.
- Make offline policy an explicit core constructor requirement; ignore provider env configuration.

### Phase 2: bundle and pin local inference

Owner: core/packaging/release/legal. Choose model artifact/revision, complete license review, add hash manifest and resources, force local-only resolution, add FTS fail-closed behavior, and measure artifact/RAM costs. This phase interacts directly with package manifests and release artifact size.

### Phase 3: defense in depth

Owner: Electron/platform security. Install pre-window session/navigation/permission/download denial, IPC sender validation, production Chromium hardening, artifact scanners, and an explicit dev-loopback policy. Prototype App Sandbox without network entitlements and either adopt it after TCC/ONNX/helper verification or record the exact incompatibility.

### Phase 4: data/update UX

Owner: Mac UX/core storage. Add static About/manual-update instructions, local privacy content, migration fixtures, backup validation/recovery docs, and reinstall/replacement QA. Keep database path stable.

### Phase 5: MCP hardening and disclosure

Owner: `packages/mcp`/privacy. Force explicit offline core construction, bound/redact tools as decided, add consent/disclosure and local activity metadata, then run MCP subprocess traffic tests.

### Phase 6: signed-artifact release gate and claims

Owner: release/QA/web/docs. Build on a clean runner, inspect the final `.app`/DMG/ZIP, run VM traffic/migration/reinstall matrix, archive traces, and only then publish the exact promise consistently across app, website, README, privacy docs, release checklist, and release notes.

## 10. Live macOS blockers and unknowns

- Whether Electron 39 plus the native Messages/Contacts flow works under App Sandbox with no network entitlements, especially Full Disk Access to `~/Library/Messages/chat.db`, spawned helper TCC identity, ONNX/JIT, and current library-validation exceptions.
- Actual Chromium/Electron background socket behavior in a signed production build across supported macOS versions, including proxy/PAC, DNS, certificate/trust checks, Safe Browsing or component services, spellcheck, captive portal, and crash behavior. Source inspection cannot settle this.
- Exact model files selected by Transformers.js 4.0.1 for the current `fp32` request, their compressed/installed/RAM size, cache layout, license notices, and universal-build behavior.
- Whether a clean production package currently contains Transformers.js at all: it is dynamically imported but declared only as a core devDependency, and no model resource is configured.
- Final signed artifact contents and generated updater metadata. No `dist` artifact is present in this worktree, so ASAR, helper signatures, notarization, dylibs, and update configuration were not inspectable here.
- Signing/notarization reality. Workflow supplies Apple API credentials, while `docs/release-checklist.md:29-35` says notarization is not configured; a live release build/log and `spctl`/`stapler` verification must resolve the discrepancy.
- Database preservation under real Finder replacement, drag-over install from DMG, rollback/downgrade, active WAL, migration failure, and low disk.
- Reliable PID-attributed traffic instrumentation for all Electron helpers and native children on CI macOS runners. Hosted runners may not permit packet capture; dedicated macOS hardware/VM infrastructure may be required.
- Whether macOS itself performs network activity because the signed app is launched. The product claim must remain process-attributed and the test methodology must distinguish OS trust traffic from app traffic.

## Recommended next implementation task

Implement **Phase 1 as an app/core code-only Network Lock skeleton, excluding all manifest and lockfile edits owned by dependency-remediation**:

1. Add an explicit immutable `production-deny-all` runtime policy before window creation and an exact-loopback-only development policy.
2. Stop updater initialization and replace update actions with static manual-update state/copy without opening a browser.
3. Remove/disable packaged Mac cloud auth, BYOK, connector credential, external HTTP(S), and loopback callback IPC paths; remove both native helper privacy links.
4. Construct core and MCP with an explicit offline provider policy that ignores inherited network environment variables and fails closed when the local model is unavailable.
5. Add unit tests for URL denial, hostile environment variables, missing-model no-fetch behavior, and MCP stdio offline behavior.

Do not claim completion after that task. Bundled model assets, dependency removal, App Sandbox feasibility, signed-artifact inspection, and live macOS zero-traffic proof remain release blockers.
