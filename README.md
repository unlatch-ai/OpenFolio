<p align="center">
  <img src="apps/mac/build/icon.png" width="80" height="80" alt="OpenFolio icon">
</p>

<h1 align="center">OpenFolio</h1>

<p align="center">
  <strong>Spotify Wrapped for your relationships — a beautiful iMessage visualization client for macOS</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS-blue?style=flat-square" alt="Platform">
  &nbsp;
  <a href="https://github.com/unlatch-ai/OpenFolio/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-green?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <a href="https://openfolio.ai">Website</a> &middot;
  <a href="https://github.com/unlatch-ai/OpenFolio/issues">Report an Issue</a>
</p>

---

OpenFolio is a native macOS app that visualizes your iMessage relationships. Browse conversations, explore relationship stats, and get your personal "Wrapped" — top contacts, messaging patterns, response times, and activity heatmaps. Everything runs 100% locally on your Mac.

## Highlights

- **Spotify Wrapped for relationships** — See your top contacts, busiest hours, messaging streaks, and monthly trends in a beautiful dashboard with gradient cards and interactive charts.
- **100% local** — Your messages never leave your Mac. SQLite database, local embeddings, no cloud required.
- **Conversation browser** — Two-panel inbox with real-time thread updates via FSEvents watcher on `chat.db`.
- **Semantic search** — Cmd+K to search your entire message history using local AI embeddings (Transformers.js, no API keys needed).
- **Relationship insights** — Response times, message volume by hour/day/month, conversation streaks, and a GitHub-style activity heatmap.
- **Beautiful design** — Warm color palette, gradient avatars, smooth Framer Motion transitions. Designed to feel like Partiful meets Apple Photos.
- **MCP server** — Expose your relationship graph to AI assistants via Model Context Protocol.
- **Open source** — AGPL-3.0. Read the code, fork it, contribute back.

## How It Works

OpenFolio reads your local `chat.db` (macOS Messages database) in read-only mode. It indexes conversations, computes relationship stats via SQL analytics, and generates local embeddings for semantic search — all without sending a single byte to the cloud.

An optional hosted account unlocks identity, billing, and managed connectors — but the local graph is always yours.

## Building from Source

**Requirements:** Node.js 22+, [pnpm](https://pnpm.io/) 10+, macOS (for Messages access)

```bash
git clone https://github.com/unlatch-ai/OpenFolio.git
cd OpenFolio
pnpm install
pnpm approve-builds   # Allow postinstall scripts (Electron, esbuild, etc.)
pnpm install           # Re-run so approved scripts execute
pnpm build             # Build workspace packages
pnpm dev               # Run the Electron app in dev mode
```

> **Note:** `pnpm dev` hot-reloads changes inside `apps/mac/src/`, but if you
> edit code in `packages/core/` you need to rebuild it
> (`pnpm --filter @openfolio/core build`) for the changes to take effect.

<details>
<summary><strong>All commands</strong></summary>

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run the Mac app in development mode |
| `pnpm dev:web` | Run the website locally |
| `pnpm dev:hosted` | Run the Convex backend locally |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run all tests |
| `pnpm build` | Build all packages |

</details>

## Architecture

```
apps/
  mac/          Electron app — shell, renderer, auto-updater
  web/          Marketing site (Next.js)

packages/
  core/         Local SQLite graph, Messages import, search, embeddings, AI,
                analytics engine, FSEvents watcher, local embeddings (Transformers.js)
  mcp/          CLI and MCP server for the local graph
  hosted/       Convex backend — identity, billing, entitlements
  shared-types/ Shared type contracts
  shared-tokens/ Design tokens (warm color palette, gradients, shadows)
```

### Key Technologies

- **Electron + React 19** — Native macOS app with modern React
- **Tailwind v4 + shadcn/ui** — Utility-first styling with pre-built components
- **Zustand** — Lightweight state management
- **Recharts** — Interactive charts for insights dashboard
- **Framer Motion** — Smooth transitions and animations
- **Transformers.js** — Local AI embeddings via `all-MiniLM-L6-v2` ONNX model (~23MB, auto-downloads)
- **node:sqlite** — Built-in Node 22 SQLite for the local database
- **cmdk** — Cmd+K command palette with semantic search

## Contributing

Contributions are welcome. If you find a bug or have an idea, please [open an issue](https://github.com/unlatch-ai/OpenFolio/issues/new). Pull requests are appreciated — just make sure `pnpm typecheck` and `pnpm test` pass before submitting.

## License

[AGPL-3.0](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/TheSnakeFang">Kevin Fang</a>
</p>
