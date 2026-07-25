import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Corelyx E2E suite — Playwright.
 *
 * Runs the visual editor / Genesis / connections flows against a running
 * Next.js instance (default http://localhost:3000). Auth state is created once
 * by the `setup` project and reused by every browser project via storageState,
 * so individual specs don't re-login on every test.
 *
 * Local env vars (BASE_URL, TEST_EMAIL, TEST_PASSWORD, …) are read from the
 * repo-root `.env.local` if present — matching the pattern used by the existing
 * automation/ Playwright config.
 */

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const equalsIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadLocalEnv();

const baseURL = process.env.BASE_URL || "http://localhost:3000";
const isCI = process.env.CI === "true";

/** Persisted logged-in browser state, produced by fixtures/auth.setup.ts. */
export const STORAGE_STATE = path.join(__dirname, ".auth", "user.json");

export default defineConfig({
  testDir: __dirname,
  // The setup project lives under fixtures/ — everything else is a *.spec.ts.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["list"],
  ],
  outputDir: "./test-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
    ignoreHTTPSErrors: false,
  },
  projects: [
    // 1. Authenticate once and cache the session for the browser projects.
    {
      name: "setup",
      testMatch: /fixtures\/auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  // Boot the web app automatically for local runs. In CI the workflow provides
  // env + starts the server the same way, so reuse it there too.
  webServer: {
    command: "pnpm --filter @flowos/web dev",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !isCI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
