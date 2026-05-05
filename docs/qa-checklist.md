# OpenFolio QA Checklist

Use this for release candidates and for changes that touch onboarding, import,
search, settings, packaging, or permissions.

## Automated gate

```bash
pnpm qa
pnpm build
```

Run `pnpm bench:search` after search, embeddings, or indexing changes.

## First-run onboarding

- Launch with a clean local database/profile.
- Confirm the first screen explains local-only setup before any hosted account
  prompt appears.
- Deny or withhold Full Disk Access and confirm the Messages step stays active
  with recovery instructions.
- Grant Full Disk Access, relaunch when prompted, and confirm the import step
  becomes available.
- Run Messages import and confirm completion allows entry even if the import
  finds zero conversations.
- Cancel a running import and confirm retry is available.
- Sync Contacts with both granted and denied permission states.
- Build the semantic index and confirm the app remains usable while indexing.

## Core app smoke

- Open Inbox, People, Insights, and Settings without renderer errors.
- Search with Cmd+K for a known contact and a known message phrase.
- Open a search result and confirm it navigates to the correct thread/person.
- Open a person profile, add a note, pin/unpin it, and mark a reminder done.
- Verify Settings can refresh Messages, Contacts, embeddings, MCP, and updater
  state without requiring hosted sign-in.

## Security and privacy

- Confirm no hosted account or cloud sync is required for first-run entry.
- Confirm the Mac renderer does not load remote fonts or scripts at startup.
- Confirm external links open only through the main-process bridge and remain
  limited to trusted OpenFolio, GitHub, Google auth, Convex auth, and local auth
  callback destinations.
- Confirm saved OpenAI keys report as present but are never rendered back into
  the UI.
- Confirm raw Messages data remains local and imported from `chat.db` read-only.
