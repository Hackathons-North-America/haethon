import { defineConfig } from "vitest/config";
import path from "node:path";

/* Timing harness behind docs/perf/4-import-votes-db.md. It drives the real
   route handlers against the throwaway local database (never a real Neon
   project) with Clerk, Next's request scope and the Discord REST client
   stubbed. Start the database first, then:

     docker compose -f docker-compose.test.yml up -d --wait
     pnpm exec vitest run --config vitest.perf.config.ts

   Not part of `pnpm test` or `pnpm test:integration`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/perf/**/*.bench.ts"],
    environment: "node",
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/perf/setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
