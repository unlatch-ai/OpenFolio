# AGENTS.md

OpenFolio is now a macOS-first monorepo.

## Active packages

- `apps/mac`: Electron desktop app
- `apps/web`: Vercel landing page and docs
- `packages/core`: local-first domain and storage
- `packages/mcp`: CLI and MCP server
- `packages/shared-types`: public shared interfaces
- `packages/hosted`: Convex-hosted commercial services

## Expectations

- Treat `packages/core` as the canonical behavior layer.
- Keep the web app limited to marketing/docs/download flows.
- Treat account creation as optional for local app entry and required only for hosted entitlements.
- Do not add raw Messages backup or cloud sync by default.
- Keep hosted code physically separated under `packages/hosted`.
- When cutting a macOS release tag, keep `apps/mac/package.json` in sync with the `v*` tag or the signing workflow will publish to the wrong GitHub release.

## Commands

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm --filter @openfolio/mac dev
```
