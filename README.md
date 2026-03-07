# OpenFolio

OpenFolio is an Electron-first, local-first relationship memory app for macOS.

## Active architecture

- `apps/mac`: Electron shell and renderer
- `apps/web`: public landing page, docs, and hosted account page
- `packages/core`: local SQLite graph, Messages import, local search, embeddings, AI orchestration, and local connectors
- `packages/mcp`: local CLI and MCP server
- `packages/hosted`: Convex-hosted identity, billing, entitlements, and future hosted MCP boundaries
- `packages/shared-types`: shared contracts

## Product boundaries

- Local SQLite is the source of truth.
- Raw Messages history stays on-device by default.
- Account creation is optional for local use.
- Hosted services exist for identity, billing, hosted AI, managed connectors, and future hosted MCP / remote access.
- Future hosted MCP may use an optional derived hosted graph, but raw Messages are not mirrored by default.

## Commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:hosted
pnpm typecheck
pnpm test
pnpm build
```

## Environment

See [`.env.example`](/Users/kevinfang/Documents/GitHub/OpenFolio/.env.example) for the current variables.

Important values:

- `CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_URL`
- `SITE_URL`
- `OPENFOLIO_SITE_URL`
- `OPENAI_API_KEY`
- `OPENFOLIO_LOCAL_DB_PATH`
- `OPENFOLIO_MESSAGES_DB_PATH`
- `OPENFOLIO_DEBUG`
- `OPENFOLIO_DEBUG_AUTH`
- `OPENFOLIO_OPEN_DEVTOOLS`

## Auth flow

The packaged Mac app registers the `openfolio://` protocol, but the primary browser completion path is a localhost loopback callback that returns the user to the app.

## Deployment

- `apps/web` deploys to Vercel
- `packages/hosted` deploys to Convex
- `apps/mac` ships signed `.dmg` and `.zip` artifacts through GitHub Releases
