import { defineConfig, devices } from "@playwright/test";

// Smoke tests against a production build: no AI provider is called (the API answers the tests
// need are mocked in the page), so they run anywhere, with no keys. `pnpm test:e2e` builds first.
const PORT = 3101;

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 }, browserName: "chromium" } },
  ],
  webServer: {
    // node directly, not through pnpm: the wrapper would be stopped but not the server it started
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // never reuse: a server left over from an earlier build would serve chunks that no longer exist
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
