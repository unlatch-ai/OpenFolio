# OpenFolio

"Spotify Wrapped for your relationships" — a read-only iMessage visualization and semantic search client for macOS.

## Quick Start

```bash
pnpm install && pnpm build && pnpm dev
```

## Monorepo Layout

| Package | Purpose |
|---------|---------|
| `apps/mac` | Electron app (main process, preload, React renderer) |
| `apps/web` | Marketing site (Next.js App Router) |
| `packages/core` | Local SQLite graph, Messages import, search, embeddings, analytics engine, FSEvents watcher |
| `packages/mcp` | MCP server for AI assistant integration |
| `packages/hosted` | Convex backend (identity, billing) — optional |
| `packages/shared-types` | TypeScript type contracts + `OpenFolioBridge` IPC interface |
| `packages/shared-tokens` | CSS design tokens (warm palette, gradients, shadows) |

## Stack

- **Runtime**: Node 22 (uses built-in `node:sqlite`), Electron 38
- **Frontend**: React 19, Tailwind v4, shadcn/ui, Zustand, Recharts, Framer Motion, cmdk
- **Embeddings**: Transformers.js + `all-MiniLM-L6-v2` ONNX (local, no API keys)
- **Database**: SQLite via `node:sqlite` DatabaseSync (FTS5 + cosine similarity search)
- **Cloud (optional)**: Convex for auth/billing/entitlements

## Key Patterns

- **IPC bridge**: All renderer ↔ main communication goes through `OpenFolioBridge` (defined in `shared-types`). Main process implements handlers in `main.ts`, preload exposes them via `contextBridge` in `preload.ts`.
- **Analytics**: `packages/core/src/analytics.ts` — pure SQL analytics engine. `AnalyticsEngine` class with `getWrappedSummary()`, `getTopContacts()`, `getRelationshipStats()`, `getMessageHeatmap()`.
- **Local embeddings**: `packages/core/src/local-embeddings.ts` — Transformers.js wrapper. Auto-downloads model to `~/Library/Application Support/OpenFolio/models/`. Opt-in via `{ enableLocalEmbeddings: true }` constructor param.
- **FSEvents watcher**: `packages/core/src/watcher.ts` — watches `chat.db` for changes, debounced 2s, with 30s polling fallback.
- **State management**: Zustand store in `apps/mac/src/renderer/store.ts`. Single store for navigation, threads, sync, cloud, and UI state.

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Electron dev mode (hot-reload renderer) |
| `pnpm typecheck` | Type-check all 7 packages |
| `pnpm test` | Run vitest (core package) |
| `pnpm build` | Build all packages |
| `pnpm --filter @openfolio/core build` | Rebuild core after editing |
| `pnpm --filter @openfolio/mac typecheck` | Typecheck just the Electron app |

## Design System

- **Warm palette**: cream background (#faf8f5), coral-orange primary (#e85d3a), amber accent (#f59e0b)
- **Gradients**: `--gradient-warm`, `--gradient-cool`, `--gradient-sunset`, `--gradient-ocean` for Wrapped cards
- **Shadows**: `--shadow-sm/md/lg/card` for elevation
- **Font**: Space Grotesk (system fallback)
- **Design bar**: Partiful / Apple Photos / Notion level quality

## Testing

- Core tests: `pnpm --filter @openfolio/core test` (vitest, 6 tests)
- Always run `pnpm typecheck` before committing — it checks all 7 packages

## Important Notes

- **Read-only**: OpenFolio never sends messages. It only reads `chat.db`.
- **Local-first**: Everything works without an internet connection or account.
- **macOS only**: Requires Full Disk Access for `chat.db` and Contacts framework access.
- When editing `packages/core`, you must rebuild before the Electron app picks up changes.
