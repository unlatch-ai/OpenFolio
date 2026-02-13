import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_fjlgozelmhdrmrlirgrm",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1, // Don't retry imports - they should be idempotent but can cause duplicates
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 900, // 15 minutes default timeout
});
