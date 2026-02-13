# AGENTS.md

Quick reference for AI agents working on OpenFolio. Use this alongside `CLAUDE.md` for deeper architecture and patterns.

## Purpose & Scope
- This file is a concise operational guide for agents.
- `CLAUDE.md` remains the detailed architectural reference.
- Documentation site at `/docs` (content in `content/docs/`).
- Source of truth is the repo, migrations, and recent git history.

## Quick Commands
```bash
pnpm dev              # Dev server
pnpm lint             # ESLint
pnpm test             # Vitest
pnpm typecheck        # TypeScript check
pnpm supabase:start   # Local Supabase (Docker)
pnpm db:reset         # Reset local DB
pnpm db:seed:local    # Seed dev user + workspace
pnpm db:types:local   # Regenerate TS types from schema
```

## Repo Map
- `app/(auth)/` — public auth routes (login, signup, invite, onboarding)
- `app/auth/callback/` — Supabase OAuth callback
- `app/app/(dashboard)/` — protected `/app/*` routes (people, companies, interactions, plan, search, settings)
- `app/api/` — API routes (people, companies, interactions, integrations, search, agent, chats, workspace, auth, import, waitlist)
- `app/docs/` — Nextra documentation site layout + catch-all route
- `content/docs/` — documentation MDX content
- `lib/` — auth, API helpers, embeddings, dedup, integrations, AI tools, pagination, rate limiting
- `lib/integrations/` — connector system (types, registry, gateway, encryption, connectors/)
- `src/trigger/` — Trigger.dev background tasks (generate-embeddings, sync-integration, find-duplicates)
- `supabase/migrations/` — database schema (source of truth)
- `tests/` — Vitest test suite (lib, api, ai, integration, e2e)

## Data Model
- **Tenancy & auth:** `workspaces`, `profiles`, `workspace_members`, `workspace_invites`, `app_invites`, `waitlist_entries`
- **Core entities:** `people`, `companies`, `interactions`, `person_companies`, `interaction_people`
- **Enrichment:** `social_profiles`, `tags`, `person_tags`, `company_tags`, `notes`
- **Integrations:** `integrations`, `sync_logs`
- **AI & ops:** `chats`, `chat_messages`, `duplicate_candidates`, `import_records`

All entities with `embedding` column use `vector(1536)` with ivfflat indexes.

## Key Patterns
- **Auth:** Every API route calls `getWorkspaceContext(request)` → validates auth + workspace membership.
- **Roles:** `owner` and `member` (workspace-level only). No global admin role.
- **Headers:** `x-workspace-id` on API requests. `apiFetch()` attaches it automatically.
- **Service role:** `createAdminClient()` bypasses RLS — used only in Trigger.dev tasks, auth flows, and AI tools. Protected by `server-only` import.
- **Integrations:** Connectors implement `IntegrationConnector` interface → registered in `registry.ts` → gateway `processSync()` handles upsert/dedup/embedding.

## Security Notes
- No global admin role — all users go through workspace membership checks
- RLS on all tables enforces workspace isolation at the DB level
- OAuth tokens encrypted at rest (AES-256-GCM)
- HMAC-signed OAuth state with timing-safe verification
- API routes verify entity ownership before mutations (IDOR prevention)
- Security headers (HSTS, X-Frame-Options, CSP basics)
- E2E auth bypass guarded by `NODE_ENV !== "production"`

## Env Vars
Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `OPENAI_API_KEY`, `TRIGGER_SECRET_KEY`

Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `OPENFOLIO_MODE` (set to `self-hosted` for open registration)

## Tests
- `vitest` for unit/API tests (270 tests)
- `playwright` for e2e tests
- Tests mock Supabase + OpenAI — no external services needed

## Gotchas
- Rate limiting is in-memory only, not distributed.
- Trigger.dev runs outside Vercel — import progress must be polled.
- `as never` casts on Supabase insert/upsert calls are needed for strict typing.
- Content for docs site lives in `content/docs/`, NOT `app/docs/`.
