# OpenFolio

An open-source, AI-native personal CRM. Manage your people, companies, and interactions with semantic search and an AI assistant.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/unlatch-ai/OpenFolio/actions/workflows/ci.yml/badge.svg)](https://github.com/unlatch-ai/OpenFolio/actions/workflows/ci.yml)

## Features

- **People & Companies** — Track contacts, companies, and interactions with tags, notes, and follow-up reminders
- **Email & Calendar Sync** — Connect Gmail and Google Calendar to automatically import interactions
- **Semantic Search** — Search your network by meaning using pgvector embeddings
- **AI Assistant** — Chat-based assistant with tool calling for querying your network
- **CSV Import** — Import from CSV, LinkedIn exports, and more
- **Contact Deduplication** — AI-powered fuzzy matching with manual merge review
- **Self-Hostable** — Run on your own infrastructure with Docker Compose
- **Extensible** — Add custom data connectors via the modular integration gateway

## Quick Start

### Hosted (openfolio.ai)

Visit [openfolio.ai](https://openfolio.ai) to get started with the hosted version.

### Self-Hosted (Docker Compose)

```bash
git clone https://github.com/unlatch-ai/OpenFolio.git
cd openfolio
./scripts/setup.sh        # Generate secrets and .env file
# Edit .env to add your OPENAI_API_KEY
docker compose up -d       # Start all services
```

Visit http://localhost:3000 to open the app.

In self-hosted mode, OpenFolio now defaults to single-user no-auth:
- No signup/login required
- A local singleton user + personal workspace are auto-created on first app/API use

See the [Self-Hosting Guide](https://openfolio.ai/docs/self-hosting) for detailed instructions.

## Development Setup

```bash
# Prerequisites: Node.js 20+, pnpm, Docker
pnpm install

# Start local Supabase
pnpm supabase:start

# Reset database with migrations and seed data
pnpm db:reset
pnpm db:seed:local

# (Optional) Generate embeddings for seed data
pnpm db:seed:embeddings

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with values from `supabase status`

# Start dev server
pnpm dev
```

Open http://localhost:3000

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Database | Supabase Postgres + pgvector |
| Auth | Supabase Auth |
| AI | OpenAI (GPT-5, text-embedding-3-small) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Background Jobs | Trigger.dev v4 |
| Deploy | Vercel / Docker Compose |

## Project Structure

```
app/
├── (auth)/              # Login, signup, onboarding
├── app/(dashboard)/     # Main app (people, companies, interactions, settings)
├── auth/                # OAuth callback
└── api/                 # API routes

components/              # React components (shadcn/ui + app-specific)
lib/
├── supabase/            # Supabase client helpers
├── integrations/        # Integration gateway, connectors, encryption
├── ai/                  # AI agent tools and prompts
├── auth.ts              # Workspace context helper
├── embeddings.ts        # Embedding text builders
└── dedup.ts             # Contact deduplication logic

src/trigger/             # Trigger.dev background tasks
supabase/migrations/     # Database schema
tests/                   # Vitest test suite
```

## Adding a Connector

OpenFolio uses a modular integration gateway. To add a new data source:

1. Create a connector in `lib/integrations/connectors/` implementing the `IntegrationConnector` interface
2. Register it in `lib/integrations/registry.ts`
3. The gateway handles normalization, dedup, and embedding generation

See [CONTRIBUTING.md](CONTRIBUTING.md) for details and existing connectors as examples.

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
pnpm lint              # ESLint
```

## Environment Variables

See [.env.example](.env.example) for all available variables. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TRIGGER_SECRET_KEY` | Yes | Trigger.dev secret key |
| `GOOGLE_CLIENT_ID` | No | For Gmail/Calendar sync |
| `GOOGLE_CLIENT_SECRET` | No | For Gmail/Calendar sync |
| `INTEGRATION_ENCRYPTION_KEY` | No | For storing OAuth tokens |
| `OPENFOLIO_MODE` | No | `self-hosted` (single-user no-auth) or `hosted` (auth required) |

## Roadmap

See the [public roadmap](https://github.com/orgs/unlatch-ai/projects/1) for planned features and upcoming work.

## Documentation

- [Self-Hosting Guide](https://openfolio.ai/docs/self-hosting)
- [Architecture Overview](https://openfolio.ai/docs/architecture)
- [Security & Privacy](https://openfolio.ai/docs/security)
- [Contributing](CONTRIBUTING.md)

Full documentation at [openfolio.ai/docs](https://openfolio.ai/docs).

## Created By

<a href="https://github.com/TheSnakeFang">
  <img src="https://github.com/TheSnakeFang.png" width="60" height="60" alt="Kevin Fang" style="border-radius:50%">
  <br>
  <sub><b>Kevin Fang</b></sub>
</a>

## License

[AGPL-3.0](LICENSE) — OpenFolio is free and open source.

The hosted version at [openfolio.ai](https://openfolio.ai) uses managed authentication and workspace provisioning. [Self-hosting](#self-hosted-docker-compose) defaults to private single-user mode.
