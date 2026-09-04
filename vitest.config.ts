import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./tests/worker-entry.ts",
      miniflare: {
        compatibilityDate: "2025-10-08",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(rootDirectory, "migrations/crm"),
          ),
          BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
          AUTH_BASE_URL: "https://auth.test",
          AUTH_EMAIL_FROM: "auth@example.com",
        },
      },
    })),
  ],
  resolve: {
    alias: { "@": path.join(rootDirectory, "src") },
  },
  test: {
    setupFiles: ["./tests/apply-migrations.ts"],
    testTimeout: 20_000,
  },
});
