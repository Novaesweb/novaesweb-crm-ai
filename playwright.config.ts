import { defineConfig, devices } from "@playwright/test";

const testBaseURL = process.env.CRM_E2E_BASE_URL || "http://127.0.0.1:3000";
const testPort = new URL(testBaseURL).port || "3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["list"]] : [["list"], ["html", { open: "never" }]],
  use: { launchOptions: process.env.CRM_E2E_CHROMIUM ? { executablePath: process.env.CRM_E2E_CHROMIUM } : undefined, baseURL: testBaseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? `npm run start -- --port ${testPort}` : `npm run dev -- --port ${testPort}`,
    url: testBaseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
