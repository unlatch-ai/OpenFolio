# OpenFolio release QA

Use this checklist on the exact signed/notarized release candidate downloaded
from the GitHub draft release. Record the artifact SHA-256 with the results.

## Automated and artifact gates

```bash
pnpm install --frozen-lockfile
pnpm qa
pnpm build
pnpm bench:search
pnpm --filter @openfolio/mac artifact:verify -- /absolute/path/to/OpenFolio.app
codesign --verify --deep --strict --verbose=2 /absolute/path/to/OpenFolio.app
xcrun stapler validate /absolute/path/to/OpenFolio.app
spctl --assess --type execute --verbose=2 /absolute/path/to/OpenFolio.app
```

- Confirm the app, DMG, ZIP, `Info.plist`, and tag all report the same version.
- Confirm the model manifest reports 8 files, 23,928,765 bytes, one weight copy,
  and the approved revision and license.
- Confirm the dependency audit reports zero known vulnerabilities.

## Clean-account onboarding

- Start on a clean macOS account with no OpenFolio Application Support folder.
- Confirm `How privacy works` opens locally and no account/browser prompt appears.
- Withhold Full Disk Access. Confirm Messages remains blocked with exact recovery
  instructions and rechecks automatically after returning from System Settings.
- Grant access and confirm read-only import becomes available.
- Start import. Confirm truthful conversation, participant, exact-search, and
  semantic-search activity states; cancel and retry once.
- Deny Contacts and use `Skip`. Confirm searchable records still allow entry.
- Grant Contacts on a second pass and confirm names resolve locally.
- Confirm exact search works while semantic indexing is incomplete.

## Search-to-source loop

- Search exact words from a known incoming message and confirm sender,
  direction, conversation, timestamp, and `Exact words` match reason.
- Search related wording and confirm no literal term highlighting is fabricated.
- Exercise person, conversation, type, preset date, and custom date filters.
- Open evidence context, then open the cited message in Conversations.
- Confirm the one-time source explanation appears once and the cited message is
  focused with surrounding records.
- Verify `⌘K`, Escape, keyboard focus, reduced motion, and narrow-window layouts.

## Product surfaces and persistence

- Open People dossiers, Conversations, Wrapped, and Settings without renderer
  errors or blank identity labels.
- Confirm attachment type is shown without raw imported filenames.
- Add/pin a local note, quit, relaunch, and confirm it persists.
- Replace the app with the candidate while preserving the Application Support
  folder. Confirm messages, index, notes, and settings remain.
- Confirm a database from a newer schema is refused rather than reset.

## Network and privacy gate

- Run [release network verification](./release-network-verification.md) across
  startup, permissions, import, Contacts, indexing, every main surface, MCP,
  idle time, relaunch, and shutdown.
- Confirm zero Internet, LAN, loopback, DNS, listening-socket, navigation,
  download, updater, or model-fetch activity from the app and every helper.
- Confirm MCP requires acknowledgment and disclose that its client has a
  separate privacy boundary.
- Archive captures, process snapshots, checksums, signing output, macOS version,
  hardware architecture, and the completed checklist with the artifact hashes.

Do not publish the draft release if any item is incomplete or ambiguous.
