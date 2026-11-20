import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.mjs/,
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: "line",
  use: { headless: true, viewport: { width: 1440, height: 900 } },
});
