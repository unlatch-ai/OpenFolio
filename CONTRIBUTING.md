# Contributing to OpenFolio

Thank you for your interest in contributing to OpenFolio. This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm` or `corepack enable`)
- [Docker](https://www.docker.com/) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Setup

```bash
git clone https://github.com/unlatch-ai/OpenFolio.git
cd openfolio
pnpm install
pnpm supabase:start       # Starts local Supabase (requires Docker)
pnpm db:reset              # Runs migrations + seed data
cp .env.example .env.local # Fill in values from `supabase status`
pnpm dev                   # http://localhost:3000
```

## Code Style

- **Package manager:** pnpm only (not npm or yarn).
- **TypeScript** with strict mode enabled.
- **2-space indentation**, semicolons required.
- **File naming:** kebab-case for files, PascalCase for React components.
- **Server components by default.** Add `"use client"` only when the component needs interactivity (hooks, event handlers, browser APIs).
- **Path alias:** `@/*` maps to the project root.
- Forms use `react-hook-form` + `zod` for validation.
- Toast notifications use Sonner.

## Adding a New Connector

OpenFolio uses a modular integration gateway at `lib/integrations/` for importing data from external sources (CSV, Gmail, etc.).

To add a new connector:

1. **Create the connector file** in `lib/integrations/connectors/` (e.g., `lib/integrations/connectors/my-source.ts`).
2. **Implement the `IntegrationConnector` interface** exported from `lib/integrations/types.ts`. Every connector must return normalized `people[]` and `interactions[]` arrays.
3. **Register the connector** in `lib/integrations/registry.ts` so the gateway can discover it.
4. **Let the gateway handle the rest.** Deduplication, embedding generation, and storage are managed centrally -- connectors only need to fetch and normalize data.

## Testing

```bash
pnpm test              # Run all tests (Vitest)
pnpm test:watch        # Watch mode for development
pnpm test:coverage     # Generate coverage report
pnpm lint              # Run ESLint
pnpm typecheck         # Type-check without emitting
```

- Write tests for new features using [Vitest](https://vitest.dev/).
- Follow existing patterns in the `tests/` directory.
- Tests verify contracts and invariants. If a test fails after your change, either the test needs updating (intentional behavior change) or there is a regression.

## Pull Request Process

1. **Create a branch** from `main`.
2. **Write tests first** when possible (test-driven development is preferred).
3. **Ensure all checks pass** before opening a PR:
   ```bash
   pnpm build && pnpm test && pnpm lint
   ```
4. **Describe your changes clearly** in the PR description. Explain what changed and why.
5. **Keep PRs focused.** One feature or fix per PR when practical.
6. PRs are reviewed before merging into `main`.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add LinkedIn connector
fix: prevent duplicate contacts on re-import
chore: upgrade Supabase SDK to v2.93
docs: document connector interface
test: add embedding merge coverage
refactor: extract dedup logic into shared helper
```

- Keep messages concise and descriptive.
- Focus on the **why**, not just the what.

## Reporting Issues

- Use [GitHub Issues](https://github.com/unlatch-ai/OpenFolio/issues) to report bugs or request features.
- For bugs, include:
  - Steps to reproduce
  - Expected vs. actual behavior
  - Your environment (OS, browser, Node version, self-hosted vs. hosted)
- For feature requests, describe the use case and any proposed approach.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
