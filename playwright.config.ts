import { defineConfig, devices } from "@playwright/test";
import { testAnonKey, testAuthUrl, testDatabase } from "./tests/support/config";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: testDatabase,
      APP_URL: "http://127.0.0.1:3100",
      SUPABASE_URL: testAuthUrl,
      SUPABASE_PUBLISHABLE_KEY: testAnonKey,
      PLANNER_AI_API_KEY: "",
      GEMINI_API_KEY: "",
      INNGEST_DEV: "0",
      INNGEST_EVENT_KEY: "",
      INNGEST_SIGNING_KEY: "",
    },
  },
});
