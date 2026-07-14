# Zero-network threat model

Status: implementation review, July 2026. Signed-release traffic proof remains a release gate.

## Promise and boundary

The installed OpenFolio Mac app is designed to make no network requests. That
means no Internet, LAN, loopback, DNS, telemetry, update, hosted-auth, remote
model, or external HTTP(S) handoff traffic from the app or its bundled helpers.
The public website and GitHub Releases are separate, ordinary networked
surfaces. An MCP client may have its own network behavior and privacy policy.

The app reads Messages and Contacts locally, writes its separate archive under
`~/Library/Application Support/OpenFolio`, and loads semantic-search assets only
from the bundled, pinned model directory. If those assets are absent or invalid,
exact search remains available and the app does not fetch a replacement.

## Threats in scope

- a dependency restoring telemetry, updater, remote-model, AI, or connector calls;
- renderer content attempting navigation, downloads, or remote subresources;
- Node networking through `fetch`, HTTP(S), sockets, DNS, TLS, or datagrams;
- inherited proxy, provider, hosted-auth, or model-hub environment variables;
- a native helper or child process opening a connection;
- package drift omitting the model or introducing a second model copy;
- a future release deleting or replacing the local archive during an update.

A compromised signed build or compromised macOS is outside this promise.
Artifact inspection, code signing, notarization, and reproducible release
evidence reduce but do not eliminate those risks.

## Defense layers

1. **Capability removal.** The Mac/MCP production closure excludes OpenAI,
   network connectors, automatic update code, hosted auth/config, runtime model
   fallback, protocol handlers, loopback callbacks, and external HTTP(S) opens.
2. **Fail-closed runtime policy.** Production installs denial before the core is
   constructed. Chromium requests, navigation, windows, permissions, and
   downloads are denied. Node network entry points are denied as defense in
   depth; the policy is not presented as a substitute for capability removal.
3. **Renderer containment.** The production renderer loads a bundled file with
   a local-only CSP, context isolation, no Node integration, and validated IPC
   senders.
4. **Pinned local model.** Model, tokenizer, configuration, manifest, hashes,
   and licenses are packaged together. The offline smoke test runs with fetch
   disabled and requires the expected 384-dimensional result.
5. **Artifact gates.** The unpacked app and ASAR are scanned for forbidden
   dependencies, hosts, updater metadata, remote assets, unexpected model
   copies, and missing licenses before release.
6. **Observed release proof.** The exact signed/notarized app and every helper
   run under PID-attributed traffic capture on real macOS. Any outbound request
   fails the release.

## Development exception

Development may use the local Vite server and WebSocket HMR. That loopback
traffic is limited to an explicit development policy and is never available to
a packaged build. Tests or environment variables must not weaken production.

## Manual updates and data preservation

OpenFolio does not check for or download updates. The user quits the app,
downloads a new release independently, and replaces the app in `/Applications`.
The database remains outside the bundle in Application Support. Before schema
migration, OpenFolio checkpoints WAL state, makes a local backup, migrates in a
transaction, and refuses a database created by a newer unsupported version.

Release QA must cover low disk space, interrupted/failed migration, active WAL,
Finder/DMG replacement, retained settings and index state, and downgrade
refusal. A backup-file existence test alone is not sufficient proof.

## MCP disclosure

OpenFolio's MCP server uses local stdio and is held to the same no-network
closure. Enabling it discloses local results to the MCP client the user chooses.
That client may send tool requests or results to a cloud service, so the app
must require an explicit acknowledgment and clearly separate client behavior
from OpenFolio behavior.

## Evidence required for a release

- frozen install, typecheck, tests, audit, and production builds;
- bundled-model manifest/hash/license and offline inference checks;
- production dependency and forbidden-import scan;
- unpacked app/ASAR/helper/dylib/entitlement/remote-string scan;
- Developer ID signature verification, notarization, and stapling verification;
- clean-account first run through query → citation → original conversation;
- PID-attributed zero-traffic evidence for the app, helpers, and local MCP
  server, archived against the exact release artifact hash.

Until those artifact-specific checks pass, public copy may describe the design
and implementation but must say that the signed-release claim remains gated on
the final observation.
