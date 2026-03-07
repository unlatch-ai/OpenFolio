#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${CONVEX_DEPLOY_KEY:?Set CONVEX_DEPLOY_KEY in .env.local before syncing hosted auth env.}"
: "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in .env.local before syncing hosted auth env.}"
: "${GOOGLE_CLIENT_SECRET:?Set GOOGLE_CLIENT_SECRET in .env.local before syncing hosted auth env.}"

CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT:-dev:blessed-pig-525}"
CONVEX_URL="${CONVEX_URL:-https://blessed-pig-525.convex.cloud}"
CONVEX_HTTP_URL="${CONVEX_HTTP_URL:-https://blessed-pig-525.convex.site}"
CONVEX_SITE_URL="${CONVEX_SITE_URL:-$CONVEX_HTTP_URL}"
NEXT_PUBLIC_CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-$CONVEX_URL}"
OPENFOLIO_SITE_URL="${OPENFOLIO_SITE_URL:-${SITE_URL:-http://localhost:3000}}"
SITE_URL="${SITE_URL:-$OPENFOLIO_SITE_URL}"

export CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT

pnpm --filter @openfolio/hosted exec convex env set AUTH_GOOGLE_ID "$GOOGLE_CLIENT_ID"
pnpm --filter @openfolio/hosted exec convex env set AUTH_GOOGLE_SECRET "$GOOGLE_CLIENT_SECRET"
pnpm --filter @openfolio/hosted exec convex env set SITE_URL "$SITE_URL"
pnpm --filter @openfolio/hosted exec convex env set OPENFOLIO_SITE_URL "$OPENFOLIO_SITE_URL"
pnpm --filter @openfolio/hosted exec convex env set CONVEX_URL "$CONVEX_URL"
pnpm --filter @openfolio/hosted exec convex env set CONVEX_HTTP_URL "$CONVEX_HTTP_URL"
pnpm --filter @openfolio/hosted exec convex env set CONVEX_SITE_URL "$CONVEX_SITE_URL"

if [[ -n "${JWT_PRIVATE_KEY:-}" ]]; then
  pnpm --filter @openfolio/hosted exec convex env set JWT_PRIVATE_KEY "$JWT_PRIVATE_KEY"
fi

if [[ -n "${JWKS:-}" ]]; then
  pnpm --filter @openfolio/hosted exec convex env set JWKS "$JWKS"
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  pnpm --filter @openfolio/hosted exec convex env set OPENAI_API_KEY "$OPENAI_API_KEY"
fi

echo "Hosted Convex env synced from $ENV_FILE"
