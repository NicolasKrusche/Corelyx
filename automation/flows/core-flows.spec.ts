import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_EMAIL = process.env.TEST_EMAIL || "test@example.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test-password";

const ARTIFACTS = "./automation/artifacts";
fs.mkdirSync(ARTIFACTS, { recursive: true });

function captureErrors(page: any, errors: string[]) {
  page.on("console", (msg: any) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err: any) => {
    errors.push(`PAGEERROR: ${err.message}`);
  });
  page.on("requestfailed", (req: any) => {
    const errorText = req.failure()?.errorText ?? "";
    // ERR_ABORTED is intentional — fetch/RSC prefetches are cancelled on navigation
    if (errorText.includes("ERR_ABORTED")) return;
    errors.push(`NETWORK FAIL: ${req.url()} — ${errorText}`);
  });
}

async function saveArtifacts(page: any, flowName: string, errors: string[]) {
  const screenshotPath = path.join(ARTIFACTS, `${flowName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const artifact = {
    flow: flowName,
    url: page.url(),
    console_errors: errors,
    screenshot_path: screenshotPath,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(ARTIFACTS, `${flowName}-context.json`),
    JSON.stringify(artifact, null, 2)
  );

  return screenshotPath;
}

async function login(page: any) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

test("login flow", async ({ page }) => {
  const errors: string[] = [];
  captureErrors(page, errors);

  await login(page);
  await page.waitForLoadState("networkidle");

  await saveArtifacts(page, "login", errors);
  expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
});

test("dashboard flow", async ({ page }) => {
  const errors: string[] = [];
  captureErrors(page, errors);

  await login(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  await saveArtifacts(page, "dashboard", errors);
  expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
});

test("settings flow", async ({ page }) => {
  const errors: string[] = [];
  captureErrors(page, errors);

  await login(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  await saveArtifacts(page, "settings", errors);
  expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
});
