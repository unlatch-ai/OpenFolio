import { defineConfig } from "@playwright/test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "sb_publishable_test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3001",
    headless: true,
  },
  webServer: {
    command:
      "OPENFOLIO_DEPLOYMENT_MODE=hosted OPENFOLIO_AUTH_MODE=supabase NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE=hosted NEXT_PUBLIC_OPENFOLIO_AUTH_MODE=supabase NEXT_PUBLIC_GOOGLE_CLIENT_ID=playwright-google-client E2E_BYPASS_AUTH=1 pnpm dev --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
