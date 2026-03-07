export const docs = {
  "getting-started": {
    title: "Getting Started",
    body: `
OpenFolio ships as a macOS app plus a hosted account and managed-services layer.

1. Download the latest DMG from GitHub Releases.
2. Drag OpenFolio into Applications and launch it.
3. Sign in with Google in the Mac app or at \`/account\`.
4. Grant Full Disk Access so the app can read Messages.
5. Import your local Messages history and start searching.

### Environment

Hosted services reuse \`GOOGLE_CLIENT_ID\`, \`GOOGLE_CLIENT_SECRET\`, and \`OPENAI_API_KEY\`. Run \`pnpm hosted:env\` to push those values from the repo \`.env.local\` into Convex.
`,
  },
  architecture: {
    title: "Architecture",
    body: `
OpenFolio is split into five packages:

- \`apps/mac\`: Electron shell and renderer
- \`apps/web\`: landing page and docs
- \`packages/core\`: local SQLite graph, search, ingestion, AI orchestration
- \`packages/mcp\`: local CLI and MCP server
- \`packages/hosted\`: Convex hosted services

### Local Data

The canonical graph lives in SQLite on the Mac. Search uses FTS plus optional embeddings in the same database.

### Hosted Boundary

Convex stores account, billing, managed connector credentials, and hosted AI metadata. Raw Messages history does not sync there by default.

### Auth Flow

The Mac app uses Google OAuth through Convex Auth. Sign-in opens in the system browser, then returns to the DMG app through \`openfolio://auth/callback\`.
`,
  },
  privacy: {
    title: "Privacy",
    body: `
OpenFolio is intentionally local-first.

- Raw Messages history stays on-device.
- OpenFolio does not back up your Messages archive.
- Hosted services are limited to account, billing, managed AI, and future managed connectors.
- BYOK AI is supported when you prefer direct provider access.

### Secrets

Sensitive tokens and API keys should be stored with Keychain-backed protection. The main local database relies on standard macOS account security and FileVault. Google OAuth secrets live in Convex env, not in the shipped DMG.
`,
  },
  deployment: {
    title: "Deployment",
    body: `
OpenFolio deploys as three separate surfaces.

### 1. Mac app distribution

- Build the Electron app with \`pnpm --filter @openfolio/mac build\`
- Package DMGs with \`pnpm --filter @openfolio/mac dist:mac\`
- Publish release artifacts with \`pnpm --filter @openfolio/mac release:mac\`
- Publish signed DMGs through GitHub Releases
- Ship both \`.dmg\` and \`.zip\` artifacts so \`latest-mac.yml\` is generated for in-app updates
- Register the \`openfolio://auth/callback\` protocol in the packaged app for browser-based sign-in
- macOS in-app updates rely on GitHub Releases metadata produced by \`electron-builder\`

### GitHub Actions secrets

- \`GH_TOKEN\`
- \`CSC_LINK\`
- \`CSC_KEY_PASSWORD\`
- \`APPLE_API_KEY\`
- \`APPLE_API_KEY_ID\`
- \`APPLE_API_ISSUER\`

Use a \`Developer ID Application\` certificate and an App Store Connect API key for notarization.

### 2. Public website

- Deploy \`apps/web\` on Vercel
- Use the landing page for download CTA, docs, and the hosted \`/account\` page
- Set \`NEXT_PUBLIC_CONVEX_URL\` in Vercel so the account page talks to Convex Auth

### 3. Hosted services

- Deploy the Convex package from \`packages/hosted\`
- Configure \`AUTH_GOOGLE_ID\`, \`AUTH_GOOGLE_SECRET\`, \`SITE_URL\`, and \`OPENFOLIO_SITE_URL\`
- Reuse the repo \`GOOGLE_CLIENT_ID\`, \`GOOGLE_CLIENT_SECRET\`, and \`OPENAI_API_KEY\` values by running \`pnpm hosted:env\`
- Add the Google redirect URI \`https://blessed-pig-525.convex.site/api/auth/callback/google\` in Google Cloud Console

### Updates

GitHub Releases is the simplest v1 update path. OpenFolio now checks GitHub Releases from the app, downloads signed updates in the background, and prompts the user to install them once ready.
`,
  },
} as const;

export type DocSlug = keyof typeof docs;
