import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;
const FAKE_MODEL = "http://127.0.0.1:3199";

// Needs the local Supabase stack (`pnpm db:start`). Starts the app itself: the dev
// server locally, the production build on CI (which runs `pnpm build` first). The
// app is pointed at a scripted stand-in for the model (tests/fake-model), so chat
// tests are repeatable and never call the real API.
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
  webServer: [
    // Always started fresh, so an old copy with other scripts is never picked up.
    { command: "node tests/fake-model/server.mjs", url: FAKE_MODEL, reuseExistingServer: false },
    {
      command: ci ? "pnpm start" : "pnpm dev",
      url: "http://localhost:3100/sign-in",
      // A dev server you started yourself is reused as it is. For the chat tests it
      // must have been started with `pnpm dev:test`, or it will call the real model.
      reuseExistingServer: !ci,
      timeout: 120_000,
      env: {
        ANTHROPIC_BASE_URL: FAKE_MODEL,
        ANTHROPIC_API_KEY: "fake-key-for-tests",
        // The lookup services are answered by the same stand-in.
        PHOTON_URL: FAKE_MODEL,
        OPEN_METEO_GEOCODING_URL: FAKE_MODEL,
        OPEN_METEO_FORECAST_URL: FAKE_MODEL,
        OPEN_METEO_ARCHIVE_URL: FAKE_MODEL,
      },
    },
  ],
});
