import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 180000,
  expect: { timeout: 10000 },
  use: { actionTimeout: 12000 },
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
});
