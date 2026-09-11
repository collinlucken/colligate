import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use Replit's Chromium when available; elsewhere use Playwright's installed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1100 },
      launchOptions: { executablePath } },
  }],
  // Never reuse a potentially stale preview server or its browser storage.
  webServer: {
    command: "npm run dev -- --port 5001 --strictPort",
    url: "http://127.0.0.1:5001",
    reuseExistingServer: false,
  },
});