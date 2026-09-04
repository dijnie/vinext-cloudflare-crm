import { defineConfig } from "@playwright/test";

const runtimeEnvironment = process["env"];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: runtimeEnvironment["E2E_BASE_URL"] ?? "https://localhost:8787",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
});
