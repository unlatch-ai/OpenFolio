# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev         # Start development server at http://localhost:3000
pnpm dev:prod    # Start dev server using .env.prod (explicitly connect to prod)
pnpm build       # Build for production
pnpm start       # Run production server
pnpm lint        # Run ESLint
pnpm test        # Run test suite
pnpm supabase:start  # Start local Supabase (Docker)
pnpm supabase:stop   # Stop local Supabase
pnpm db:reset        # Reset local DB (migrations + seed.sql)
pnpm db:seed:local   # Create local dev auth user + workspace membership
pnpm db:seed:embeddings  # Generate embeddings for seed data (requires OPENAI_API_KEY)
pnpm db:types:local  # Generate types from local schema
pnpm db:types:prod   # Generate types from prod (requires SUPABASE_PROJECT_ID_PROD)
vercel --prod    # Deploy to production
```

> **Package Manager:** This project uses pnpm. Install it via `npm install -g pnpm` or `corepack enable`.

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `OPENAI_API_KEY` - OpenAI API key for extraction and embeddings
- `TRIGGER_SECRET_KEY` - Trigger.dev secret key for background jobs

Server-side only (for service operations):
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

Local Supabase (from `supabase status`):
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_URL=http://127.0.0.1:54321
TRIGGER_SECRET_KEY=...
```

## Architecture Overview

OpenFolio is an AI-native personal CRM. It stores people, companies, and interactions with embeddings via OpenAI, and provides semantic search + AI assistant via pgvector.

**Stack:** Next.js 16 (App Router) + Supabase (Postgres + pgvector) + OpenAI + Tailwind CSS 4 + shadcn/ui + Trigger.dev (background jobs)

### Directory Structure

```
app/
├── (auth)/               # Public auth routes (login, signup, invite, onboarding)
├── auth/                 # OAuth callback route
├── app/(dashboard)/      # Protected routes under /app
│   ├── people/           # People directory
│   ├── companies/        # Companies directory
│   ├── interactions/     # Interactions log
│   ├── plan/             # AI assistant (chat UI)
│   ├── search/           # Semantic search interface
│   └── settings/         # CSV import, integrations, workspace settings
├── docs/                 # Documentation site (Nextra)
└── api/                  # API routes
    ├── auth/             # Auth helpers (invite-only signup, claim-invites)
    ├── people/           # People CRUD, duplicates, merge
    ├── companies/        # Companies CRUD
    ├── interactions/     # Interactions CRUD
    ├── integrations/     # Connect, disconnect, sync (Google OAuth)
    ├── import/           # CSV upload + processing
    ├── workspace/        # Workspace management (members, invites)
    ├── search/           # Vector similarity search
    ├── agent/            # AI chat agent with tool calling
    ├── chats/            # Chat session management
    └── draft-email/      # Email generation

content/docs/             # Documentation MDX content (Nextra)

components/
├── ui/                   # shadcn/ui components (Radix + Tailwind)
└── *.tsx                 # App-specific components

lib/
├── supabase/
│   ├── client.ts         # Browser-side Supabase client
│   ├── server.ts         # Server-side Supabase client
│   ├── admin.ts          # Service role client (server-only)
│   └── middleware.ts     # Auth session handling
├── integrations/
│   ├── types.ts          # Connector interface
│   ├── registry.ts       # Connector registry
│   ├── gateway.ts        # Sync processing pipeline
│   ├── encryption.ts     # AES-256-GCM token encryption
│   └── connectors/       # Built-in connectors (CSV, Google)
├── ai/                   # AI tools and system prompts
├── auth.ts               # Workspace context helper (getWorkspaceContext)
├── api.ts                # Client-side fetch helper (adds x-workspace-id)
├── dedup.ts              # Contact deduplication logic
├── embeddings.ts         # Embedding text builders + merge helpers
└── openai.ts             # OpenAI API wrapper

src/trigger/              # Trigger.dev background tasks
├── generate-embeddings.ts
├── sync-integration.ts
└── find-duplicates.ts

tests/                    # Test suite (Vitest)
├── lib/                  # Unit tests for lib functions
├── api/                  # API route tests
├── ai/                   # AI tool and agent tests
└── integration/          # Integration tests

types/index.ts            # TypeScript interfaces (Person, Company, Interaction)
middleware.ts             # Route protection middleware
```

### Key Data Flows

**CSV Import:** Upload CSV → map columns → dedupe rows → batch generate embeddings → upsert contacts

**Semantic Search:** Query → embed with text-embedding-3-small → cosine similarity search via pgvector → return ranked results

### Database

Supabase Postgres with pgvector extension.

**Core tables:** `workspaces`, `profiles`, `workspace_members`, `workspace_invites`, `people`, `companies`, `interactions`, `person_companies`, `interaction_people`, `social_profiles`, `tags`, `person_tags`, `company_tags`, `notes`, `integrations`, `sync_logs`, `duplicate_candidates`, `import_records`, `chats`, `chat_messages`, `app_invites`, `waitlist_entries`

All tables have RLS policies enforcing workspace-based isolation via `workspace_members`. Embeddings stored directly on entities as `vector(1536)` columns with ivfflat indexes.

**Type Generation:** Run `pnpm supabase:types` to regenerate `lib/supabase/database.types.ts` from Supabase schema.

### Multi-Workspace System

Users can belong to multiple workspaces. The system uses:

- **`workspace_members`** - Junction table linking users to workspaces with role (owner/member)
- **`workspace_invites`** - Pending invitations by email
- **`app_invites`** - Invite-only signup tokens
- **`x-workspace-id` header** - Client sends current workspace ID with each API request (legacy `x-org-id` fallback)
- **`getWorkspaceContext()`** - Server validates auth + workspace membership

**Roles:**
- `owner` - Workspace-level, can manage members and settings
- `member` - Workspace-level, can view/edit data

### Authentication

Supabase Auth with email/password. Session managed via cookies.
Invite-only: account creation requires an `app_invites` token (`/signup?token=...`). Workspace invites are accepted via `/invite?token=...`.

**Server-side auth pattern:**
```typescript
import { getWorkspaceContext, isWorkspaceContextError, requireOwner } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  // ctx.workspaceId - validated workspace ID
  // ctx.user.id - authenticated user ID
  // ctx.workspaceRole - 'owner' or 'member'

  // For owner-only operations:
  if (!requireOwner(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**Client-side:**
```typescript
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api'

// apiFetch automatically adds x-workspace-id header from workspace context
const data = await apiFetch('/api/people')
```

## Coding Patterns

- **Path alias**: `@/*` maps to project root
- **TypeScript** with strict mode
- **2-space indentation**, semicolons required
- **File naming**: kebab-case for files, PascalCase for components
- **Server components by default**; use `"use client"` for interactivity
- Forms use react-hook-form + Zod validation
- Toast notifications via Sonner
- API routes return JSON; streaming via ReadableStream for long operations
- Cursor pagination via `lib/pagination.ts`
- API rate limiting via `lib/rate-limit.ts` (in-memory)

## Testing

The test suite verifies core functionality that shouldn't break from UI changes. Tests are designed for AI agents to run after feature development to catch regressions.

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode for development
pnpm test:coverage     # Generate coverage report
```

**What's tested:**
- `lib/auth.ts` - Workspace context validation, permission checks
- `lib/embeddings.ts` - Embedding text builders, data merging
- API routes - Auth enforcement, workspace isolation

**Test philosophy:** These tests verify contracts and invariants. If a test fails after a feature change, either:
1. The test needs updating (intentional behavior change)
2. There's a bug or unintended side effect

## Production

Set env vars in Vercel Dashboard or via `vercel env add <VAR> production`.

## Documentation

The documentation site is built with **Nextra 4** and lives at `/docs` in the app.

- **Content**: `content/docs/` — MDX files organized by section
- **Route**: `app/docs/` — Nextra layout + catch-all route
- **Sections**: Getting Started, Architecture, Security & Privacy, Self-Hosting, Integrations, Contributing

To add or edit documentation, modify MDX files in `content/docs/` and update `_meta.js` for sidebar ordering.


<!-- TRIGGER.DEV basic START -->
# Trigger.dev Basic Tasks (v4)

**MUST use `@trigger.dev/sdk`, NEVER `client.defineJob`**

## Basic Task

```ts
import { task } from "@trigger.dev/sdk";

export const processData = task({
  id: "process-data",
  retry: {
    maxAttempts: 10,
    factor: 1.8,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30_000,
    randomize: false,
  },
  run: async (payload: { userId: string; data: any[] }) => {
    // Task logic - runs for long time, no timeouts
    console.log(`Processing ${payload.data.length} items for user ${payload.userId}`);
    return { processed: payload.data.length };
  },
});
```

## Schema Task (with validation)

```ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const validatedTask = schemaTask({
  id: "validated-task",
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
  run: async (payload) => {
    // Payload is automatically validated and typed
    return { message: `Hello ${payload.name}, age ${payload.age}` };
  },
});
```

## Triggering Tasks

### From Backend Code

```ts
import { tasks } from "@trigger.dev/sdk";
import type { processData } from "./trigger/tasks";

// Single trigger
const handle = await tasks.trigger<typeof processData>("process-data", {
  userId: "123",
  data: [{ id: 1 }, { id: 2 }],
});

// Batch trigger (up to 1,000 items, 3MB per payload)
const batchHandle = await tasks.batchTrigger<typeof processData>("process-data", [
  { payload: { userId: "123", data: [{ id: 1 }] } },
  { payload: { userId: "456", data: [{ id: 2 }] } },
]);
```

### Debounced Triggering

Consolidate multiple triggers into a single execution:

```ts
// Multiple rapid triggers with same key = single execution
await myTask.trigger(
  { userId: "123" },
  {
    debounce: {
      key: "user-123-update",  // Unique key for debounce group
      delay: "5s",              // Wait before executing
    },
  }
);

// Trailing mode: use payload from LAST trigger
await myTask.trigger(
  { data: "latest-value" },
  {
    debounce: {
      key: "trailing-example",
      delay: "10s",
      mode: "trailing",  // Default is "leading" (first payload)
    },
  }
);
```

**Debounce modes:**
- `leading` (default): Uses payload from first trigger, subsequent triggers only reschedule
- `trailing`: Uses payload from most recent trigger

### From Inside Tasks (with Result handling)

```ts
export const parentTask = task({
  id: "parent-task",
  run: async (payload) => {
    // Trigger and continue
    const handle = await childTask.trigger({ data: "value" });

    // Trigger and wait - returns Result object, NOT task output
    const result = await childTask.triggerAndWait({ data: "value" });
    if (result.ok) {
      console.log("Task output:", result.output); // Actual task return value
    } else {
      console.error("Task failed:", result.error);
    }

    // Quick unwrap (throws on error)
    const output = await childTask.triggerAndWait({ data: "value" }).unwrap();

    // Batch trigger and wait
    const results = await childTask.batchTriggerAndWait([
      { payload: { data: "item1" } },
      { payload: { data: "item2" } },
    ]);

    for (const run of results) {
      if (run.ok) {
        console.log("Success:", run.output);
      } else {
        console.log("Failed:", run.error);
      }
    }
  },
});

export const childTask = task({
  id: "child-task",
  run: async (payload: { data: string }) => {
    return { processed: payload.data };
  },
});
```

> Never wrap triggerAndWait or batchTriggerAndWait calls in a Promise.all or Promise.allSettled as this is not supported in Trigger.dev tasks.

## Waits

```ts
import { task, wait } from "@trigger.dev/sdk";

export const taskWithWaits = task({
  id: "task-with-waits",
  run: async (payload) => {
    console.log("Starting task");

    // Wait for specific duration
    await wait.for({ seconds: 30 });
    await wait.for({ minutes: 5 });
    await wait.for({ hours: 1 });
    await wait.for({ days: 1 });

    // Wait until specific date
    await wait.until({ date: new Date("2024-12-25") });

    // Wait for token (from external system)
    await wait.forToken({
      token: "user-approval-token",
      timeoutInSeconds: 3600, // 1 hour timeout
    });

    console.log("All waits completed");
    return { status: "completed" };
  },
});
```

> Never wrap wait calls in a Promise.all or Promise.allSettled as this is not supported in Trigger.dev tasks.

## Key Points

- **Result vs Output**: `triggerAndWait()` returns a `Result` object with `ok`, `output`, `error` properties - NOT the direct task output
- **Type safety**: Use `import type` for task references when triggering from backend
- **Waits > 5 seconds**: Automatically checkpointed, don't count toward compute usage
- **Debounce + idempotency**: Idempotency keys take precedence over debounce settings

## NEVER Use (v2 deprecated)

```ts
// BREAKS APPLICATION
client.defineJob({
  id: "job-id",
  run: async (payload, io) => {
    /* ... */
  },
});
```

Use SDK (`@trigger.dev/sdk`), check `result.ok` before accessing `result.output`

<!-- TRIGGER.DEV basic END -->
