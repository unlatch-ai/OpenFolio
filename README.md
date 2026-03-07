<p align="center">
  <strong>OpenFolio</strong>
</p>

<p align="center">
  Local-first relationship intelligence for macOS.
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/unlatch-ai/OpenFolio?style=flat-square&label=Latest" alt="Latest release">
  &nbsp;
  <img src="https://img.shields.io/badge/Platform-macOS%2015%2B-blue?style=flat-square" alt="Platform">
  &nbsp;
  <img src="https://img.shields.io/badge/Architecture-Apple%20Silicon-orange?style=flat-square" alt="Architecture">
</p>

<p align="center">
  <a href="https://github.com/unlatch-ai/OpenFolio/releases/latest">Download</a>
  ·
  <a href="https://github.com/unlatch-ai/OpenFolio/tree/main/apps/web">Website</a>
  ·
  <a href="https://github.com/unlatch-ai/OpenFolio/tree/main/apps/web/app/docs">Docs</a>
</p>

---

OpenFolio is a macOS app for turning your local relationship history into a searchable, agent-friendly personal dashboard. It is designed for people who want the power of a personal CRM without the weight of a sales workflow.

The local app keeps your relationship graph on-device. Hosted services exist for Google sign-in, billing, managed AI, and future managed connectors.

## What OpenFolio Does

- Imports your local Messages history in read-only mode
- Builds a local people/thread/message graph in SQLite
- Supports keyword search and AI-assisted search over that graph
- Lets you add notes and reminders without leaving the desktop app
- Exposes local CLI and MCP surfaces so your own agents can interact with the graph

## Product Boundaries

OpenFolio is intentionally split into two layers:

- Local app:
  canonical SQLite graph, Messages import, local search, local notes/reminders, local MCP and CLI
- Hosted services:
  account creation, Google auth via Convex Auth, billing, managed AI relay, and future managed connectors

Raw Messages history is not backed up by OpenFolio and is not sent to hosted services by default.

## Installation

1. Download the latest DMG from the [GitHub releases page](https://github.com/unlatch-ai/OpenFolio/releases/latest)
2. Open the DMG and drag **OpenFolio.app** into `/Applications`
3. Launch the app and sign in with Google
4. Grant Full Disk Access so OpenFolio can read `~/Library/Messages/chat.db`
5. Import Messages and begin searching

## CLI And Agent Access

The local agent package exposes a CLI and MCP server:

```bash
# Search your local graph
openfolio search "who have I not talked to recently"

# Ask for a synthesized answer
openfolio ask "summarize my recent history with Ada"

# Fetch a local person
openfolio person get person_123

# Add a note
openfolio note add --entity-type person --entity-id person_123 --content "Strong design taste, prefers concise updates"

# Add a reminder
openfolio reminder add --title "Follow up with Ada" --person-id person_123

# Start the MCP server
openfolio mcp serve
```

## Building From Source

Requirements:

- Node.js 22+
- `pnpm`
- macOS 15+ on Apple Silicon for the desktop app runtime

```bash
git clone https://github.com/unlatch-ai/OpenFolio.git
cd OpenFolio
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Useful package scripts:

```bash
pnpm --filter @openfolio/mac dev
pnpm --filter @openfolio/web dev
pnpm --filter @openfolio/hosted dev
pnpm hosted:env
pnpm hosted:jwt
pnpm --filter @openfolio/mac dist:mac
```

For hosted auth, the Google OAuth callback configured in Google Cloud must include:

```text
https://blessed-pig-525.convex.site/api/auth/callback/google
```

## Deployment Notes

### Mac app

- Current distribution target is a signed DMG published through GitHub Releases
- `electron-builder` is configured for GitHub Releases publishing plus `dmg` and `zip` artifacts
- GitHub Releases is the simplest distribution path for v1
- The app uses `openfolio://auth/callback` to complete browser-based Google sign-in
- In-app updates now check GitHub Releases and prompt with `Cancel` / `Update` once a download is ready
- macOS auto-update requires the signed release build and the `zip` artifact that produces `latest-mac.yml`
- `pnpm --filter @openfolio/mac release:mac` is the explicit publish command for release builds

### Hosted services

- Hosted services are packaged under `packages/hosted`
- Convex powers Google auth, account state, billing state, and managed service boundaries
- Convex Auth also requires `JWT_PRIVATE_KEY` and `JWKS`
- Generate those once with `pnpm hosted:jwt`, then add them to `.env.local` and your Convex deployment settings
- The root `.env.local` values for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and `OPENAI_API_KEY` can be pushed into Convex with `pnpm hosted:env`

### Website and docs

- `apps/web` is the Vercel-deployed public site
- It contains the landing page, download CTA, docs, and a hosted account page at `/account`

## Release Checklist

1. Run `pnpm hosted:env` if Google or OpenAI keys changed.
2. Build and test the workspace with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. Sign and notarize the macOS app in your release environment.
4. Publish `dmg` and `zip` artifacts to GitHub Releases with `pnpm --filter @openfolio/mac release:mac`.
5. Verify the release includes `latest-mac.yml` so in-app update checks can find it.

## Release Secrets

The GitHub Actions release workflow expects these repository secrets:

- `GH_TOKEN`: GitHub token with permission to create/update releases
- `CSC_LINK`: base64-encoded Developer ID Application certificate (`.p12`) or a secure URL/path electron-builder can read
- `CSC_KEY_PASSWORD`: password for the signing certificate
- `APPLE_API_KEY`: App Store Connect API private key contents
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID

For local release testing outside GitHub Actions, the same values can be exported in your shell before running `pnpm --filter @openfolio/mac release:mac`.

## Apple Setup

On your side, you still need to do the Apple-account work:

1. In the Apple Developer portal, create a `Developer ID Application` certificate for outside-App-Store distribution.
2. Export that certificate from Keychain Access as a `.p12` file with a password.
3. In App Store Connect, create an API key with access to notarization, then record the key ID and issuer ID and save the `.p8` private key contents.
4. Put those values into the GitHub repository secrets listed above.

Once those are in place, the repo-side workflow in `.github/workflows/release-mac.yml` can sign, notarize, and publish release artifacts to GitHub Releases.

## Repository Layout

```text
.
├── apps/
│   ├── mac/        # Electron app
│   └── web/        # Vercel landing page and docs
├── packages/
│   ├── core/       # Local SQLite graph, search, import, AI orchestration
│   ├── hosted/     # Convex-hosted account/billing/managed service layer
│   ├── mcp/        # Local MCP server and CLI
│   └── shared-types/
└── README.md
```

## Licensing

The repository is public, but not every package has the same license boundary:

- `apps/mac`, `packages/core`, `packages/mcp`, and `packages/shared-types` follow the root AGPL license
- `packages/hosted` is public for transparency and auditing, but it is explicitly not covered by the AGPL grant

See `packages/hosted/LICENSE.md` for the hosted-service notice.
