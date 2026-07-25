import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4317",
    browserName: "chromium",
    headless: true,
    launchOptions: { executablePath: "/usr/bin/google-chrome" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "corepack pnpm --filter @knowledge-os/desktop dev --host 127.0.0.1 --port 4317",
    env: { VITE_E2E: "1" },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4317",
  },
});
