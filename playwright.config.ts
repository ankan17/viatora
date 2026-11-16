import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;

// Needs the local Supabase stack (`pnpm db:start`). Starts the app itself: the dev
// server locally, the production build on CI (which runs `pnpm build` first).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: ci ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3100/sign-in",
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
