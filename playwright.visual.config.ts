import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Screenshot tests. Run them with `pnpm test:visual` (scripts/visual.mjs), which
// starts the browser inside Playwright's Linux image and passes its address here.
// Text renders differently on macOS, so the committed screenshots only match a
// browser from that image.
const wsEndpoint = process.env.VISUAL_BROWSER_WS;
if (!wsEndpoint) throw new Error("Run the visual tests with `pnpm test:visual`, not `playwright test` directly.");

export default defineConfig({
  ...base,
  testDir: "tests/visual",
  outputDir: "test-results/visual",
  snapshotPathTemplate: "{testDir}/screenshots/{projectName}/{arg}{ext}",
  // A failed shot is a real difference; a second try would only hide flakiness.
  retries: 0,
  expect: {
    toHaveScreenshot: {
      // One image pixel per CSS pixel keeps the phone shots small.
      scale: "css",
      stylePath: "tests/visual/screenshot.css",
    },
  },
  use: {
    ...base.use,
    // The app and Supabase run on this machine; the browser reaches them through the connection.
    connectOptions: { wsEndpoint, exposeNetwork: "<loopback>" },
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
