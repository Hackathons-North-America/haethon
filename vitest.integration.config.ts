import { defineConfig } from "vitest/config";
import path from "node:path";

/* Database-backed tests. Start the throwaway database first:
     docker compose -f docker-compose.test.yml up -d --wait
   then run `pnpm test:integration`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    // One shared database: files must not truncate it under each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
