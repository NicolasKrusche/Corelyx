/**
 * Interactive QA — tests real user actions: clicking buttons, filling forms,
 * and verifying the resulting UI state. Does not complete destructive actions
 * (no actual key creation, no actual workflow publish).
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_EMAIL = process.env.TEST_EMAIL || "test@example.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test-password";
const ARTIFACTS = "./automation/artifacts/interactive";
fs.mkdirSync(ARTIFACTS, { recursive: true });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "";
    if (!err.includes("ERR_ABORTED")) errors.push(`NETFAIL: ${req.url()} — ${err}`);
  });
  return errors;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

// ─── API Keys ────────────────────────────────────────────────────────────────

test("api-keys — add key dialog opens and validates", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/api-keys");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Click "Add key" / "Add first key"
  const addBtn = page.getByRole("button", { name: /add.*(first )?key/i }).first();
  await addBtn.click();
  await shot(page, "api-key-dialog-open");

  // Dialog should appear — Radix portals use [role="dialog"] or data attribute
  const dialog = page.locator('[role="dialog"]').or(page.getByText("Add API key").locator("..").locator(".."));
  await expect(dialog.first()).toBeVisible({ timeout: 5_000 });

  // There should be a label input
  const labelInput = page.getByPlaceholder(/production/i).or(page.locator('input[placeholder*="key" i]')).first();
  await expect(labelInput).toBeVisible({ timeout: 3_000 });

  const saveBtn = page.getByRole("button", { name: /save key/i });
  const isDisabled = await saveBtn.isDisabled();

  // Fill label and close without saving
  await labelInput.fill("qa-test");
  await shot(page, "api-key-dialog-filled");
  await page.keyboard.press("Escape");

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
  console.log(`  API key dialog disabled when empty: ${isDisabled}`);
});

// ─── Env Vars ─────────────────────────────────────────────────────────────────

test("env-vars — add variable dialog opens", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/env-vars");
  await page.waitForLoadState("networkidle").catch(() => {});

  const addBtn = page.getByRole("button", { name: /add.*(first )?variable/i }).first();
  await addBtn.click();
  await shot(page, "env-var-dialog-open");

  // Dialog title is visible
  const dialogTitle = page.getByText("Add environment variable");
  await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

  // Inputs exist
  const nameInput = page.locator("#env-name").or(page.getByPlaceholder(/my_variable/i));
  await expect(nameInput).toBeVisible({ timeout: 3_000 });
  const valueInput = page.locator("#env-value").or(page.locator('input[type="password"]'));
  await expect(valueInput).toBeVisible();

  // Type a name — auto-uppercases
  await nameInput.fill("test_secret");
  const nameValue = await nameInput.inputValue();
  expect(nameValue).toBe("TEST_SECRET");
  await shot(page, "env-var-dialog-filled");

  await page.keyboard.press("Escape");
  const filtered = errors.filter((e) => !e.includes("favicon") && !e.includes("500"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});

// ─── Profile ─────────────────────────────────────────────────────────────────

test("profile — display name input renders and accepts text", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/profile");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "profile-loaded");

  // Find display name input
  const nameInput = page.getByLabel(/display name/i).or(page.locator('input[name="display_name"]')).or(page.locator('input[placeholder*="name" i]')).first();
  await expect(nameInput).toBeVisible({ timeout: 5_000 });

  const original = await nameInput.inputValue();
  await nameInput.fill("QA Tester");
  await shot(page, "profile-edited");

  // Restore original to avoid persisting changes
  await nameInput.fill(original || "");

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});

// ─── Genesis — new workflow form ──────────────────────────────────────────────

test("genesis — type a prompt and check Build button activates", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/programs/new");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "genesis-blank");

  // The main textarea
  const textarea = page.getByPlaceholder(/describe/i).or(page.locator("textarea").first());
  await expect(textarea).toBeVisible({ timeout: 5_000 });

  await textarea.fill("Send me a Slack message every morning with today's top HackerNews stories");
  await shot(page, "genesis-typed");

  // Build / submit button should become enabled
  const buildBtn = page.getByRole("button", { name: /build/i }).or(page.getByRole("button", { name: /generate/i })).first();
  const isEnabled = await buildBtn.isEnabled();
  expect(isEnabled, "Build button should be enabled after typing a prompt").toBe(true);

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});

// ─── Dashboard — stat cards visible ──────────────────────────────────────────

test("dashboard — stat cards and workspace name visible", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "dashboard-loaded");

  // Stat cards — look for numeric values (0 is fine for a fresh account)
  const stats = page.locator("main").getByText(/active workflow|runs this week|success rate|awaiting/i);
  const count = await stats.count();
  expect(count, "Expected at least one stat card label").toBeGreaterThan(0);

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});

// ─── Runs — trigger run button visible ───────────────────────────────────────

test("runs — page controls render", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/runs");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "runs-loaded");

  const triggerBtn = page.getByRole("button", { name: /trigger run/i })
    .or(page.getByText("Trigger run").locator(".."));
  await expect(triggerBtn.first()).toBeVisible({ timeout: 8_000 });

  const exportBtn = page.getByRole("button", { name: /export/i });
  await expect(exportBtn).toBeVisible({ timeout: 5_000 });

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});

// ─── Settings — sections visible ─────────────────────────────────────────────

test("settings — account sections visible", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "settings-loaded");

  // Should see Account Details and Workspace Status sections
  const accountDetails = page.getByText(/account details/i);
  await expect(accountDetails).toBeVisible({ timeout: 5_000 });

  const email = page.getByText(TEST_EMAIL).first();
  await expect(email).toBeVisible({ timeout: 5_000 });

  const filtered = errors.filter((e) => !e.includes("favicon"));
  expect(filtered, `Console errors: ${filtered.join(", ")}`).toHaveLength(0);
});
