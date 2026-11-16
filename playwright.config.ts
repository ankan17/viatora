import { defineConfig, devices } from "@playwright/test";

// Needs the local Supabase stack (`pnpm db:start`). Starts the dev server itself.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: "pnpm dev", url: "http://localhost:3100/sign-in", reuseExistingServer: true, timeout: 120_000 },
});
