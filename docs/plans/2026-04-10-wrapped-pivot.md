# OpenFolio V1: "Spotify Wrapped for Relationships"

**Date**: 2026-04-10
**Status**: Complete

## Vision
Read-only iMessage visualization + semantic search client. Beautiful, local-first.
Design bar: Partiful / Apple / Notion. Audience: semi-technical, social-forward.

## Architecture Decisions
- **Local embeddings**: Transformers.js + all-MiniLM-L6-v2 ONNX (~23MB auto-download)
- **No LLM in V1**: All insights computed from SQL, no AI summaries
- **Real-time sync**: FSEvents watcher + polling fallback on chat.db
- **State**: Zustand (lightweight, no SSR in Electron)
- **Viz**: Recharts for charts, custom SVG for heatmaps
- **Animation**: Framer Motion for transitions and micro-interactions
- **Lists**: @tanstack/react-virtual installed (ready for virtualization)

## Phase 1: Core Infrastructure
- [x] Create `packages/core/src/local-embeddings.ts` — Transformers.js wrapper
- [x] Modify `packages/core/src/types.ts` — add `"local"` provider
- [x] Modify `packages/core/src/ai.ts` — add local embedding branch
- [x] Create `packages/core/src/watcher.ts` — FSEvents + polling
- [x] Create `packages/core/src/analytics.ts` — SQL analytics engine
- [x] Modify `packages/core/src/db.ts` — thread detail queries, new indexes
- [x] Modify `packages/core/src/app.ts` — expose analytics, watcher
- [x] Modify `packages/shared-types/src/index.ts` — new types + bridge extensions

## Phase 2: Main Process Wiring
- [x] Modify `apps/mac/src/main.ts` — IPC handlers for threads, insights, sync, embeddings
- [x] Modify `apps/mac/src/preload.ts` — bridge mappings

## Phase 3: UI Shell + Navigation
- [x] Add deps: zustand, @tanstack/react-virtual, recharts, framer-motion, cmdk
- [x] Create store.ts (Zustand)
- [x] Create AppSidebar with gradient logo, search trigger, nav
- [x] Create CommandPalette (Cmd+K)
- [x] Update tokens.css with warm palette + gradient tokens + shadow system

## Phase 4: Inbox + Thread Views
- [x] InboxView with two-panel layout (thread list + thread detail)
- [x] ThreadPanel with message bubbles (iMessage-style)
- [x] ContactAvatar with deterministic gradient based on name hash

## Phase 5: Insights / Wrapped
- [x] Wire analytics IPC (types, main.ts, preload.ts, bridge)
- [x] StatCard components with gradient icons
- [x] MonthlyChart (AreaChart via Recharts)
- [x] DayOfWeekChart (BarChart via Recharts)
- [x] MessageHeatmap (GitHub-style contribution graph)
- [x] TopContactsList with rank, avatar, stats
- [x] Year selector (navigate between years)

## Phase 6: Polish
- [x] Framer Motion transitions (inbox panel, stat cards, top contacts)
- [x] Keyboard navigation (arrow keys in inbox, Escape to deselect)
- [x] Loading states (skeleton shimmer, loading dots)
- [x] Error boundary (ErrorBoundary component wrapping app)
- [x] Custom scrollbar styling
- [x] Focus-visible ring on thread rows

## Phase 7: Cleanup
- [x] Update dependencies (pnpm update --recursive)
- [x] Update README for new vision
- [x] Create CLAUDE.md
- [x] Wipe old GitHub releases (v0.3.0 deleted)
- [x] Update marketing site content (hero, features, capabilities, CTA)
