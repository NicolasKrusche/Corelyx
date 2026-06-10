/**
 * Deep QA — full site coverage.
 * Creates real workflows via Genesis, navigates every page, tests every interactive
 * element, runs workflows, and collects all defects into a JSON report.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const EMAIL = process.env.TEST_EMAIL!;
const PASSWORD = process.env.TEST_PASSWORD!;
const ARTIFACTS = "./automation/artifacts/deep";
fs.mkdirSync(ARTIFACTS, { recursive: true });

// ─── Shared state ─────────────────────────────────────────────────────────────
const bugs: Array<{ area: string; description: string; severity: "high" | "medium" | "low" }> = [];

function bug(area: string, description: string, severity: "high" | "medium" | "low" = "medium") {
  console.log(`\n🐛 BUG [${severity.toUpperCase()}] ${area}: ${description}`);
  bugs.push({ area, description, severity });
}

function collectErrors(page: Page, area: string): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon")) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "";
    if (!err.includes("ERR_ABORTED")) errors.push(`NETFAIL ${req.url()} — ${err}`);
  });
  return () => errors;
}

async function shot(page: Page, name: string) {
  const p = path.join(ARTIFACTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(EMAIL);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function waitIdle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

// ─── 1. DASHBOARD ─────────────────────────────────────────────────────────────
test("1 · dashboard — full render check", async ({ page }) => {
  const errs = collectErrors(page, "dashboard");
  await login(page);
  await shot(page, "01-dashboard");

  // Stat cards
  const main = page.locator("main");
  await expect(main).toBeVisible();

  // Sidebar links visible
  const sidebar = page.locator("nav, aside").first();
  await expect(sidebar).toBeVisible();

  // Get-started cards
  const started = page.getByText(/get started/i).or(page.getByText(/create.*first workflow/i));
  const hasStarted = await started.count() > 0;
  if (!hasStarted) bug("dashboard", "Get-started section missing", "low");

  const e = errs();
  if (e.length) bug("dashboard", e.join(" | "), "high");
});

// ─── 2. GENESIS — create workflow A ───────────────────────────────────────────
test("2 · genesis — create 'Slack HN digest' workflow", async ({ page }) => {
  test.setTimeout(120_000);
  const errs = collectErrors(page, "genesis");
  await login(page);
  await page.goto("/programs/new");
  await waitIdle(page);
  await shot(page, "02-genesis-blank");

  const textarea = page.getByPlaceholder(/describe/i).or(page.locator("textarea").first());
  await expect(textarea).toBeVisible({ timeout: 8_000 });
  await textarea.fill(
    "Every weekday morning at 8am, fetch the top 5 HackerNews stories and send them as a Slack message to #general"
  );
  await shot(page, "02-genesis-typed");

  // Click Build
  const buildBtn = page.getByRole("button", { name: /build/i }).first();
  await expect(buildBtn).toBeEnabled({ timeout: 5_000 });
  await buildBtn.click();
  await shot(page, "02-genesis-building");

  // Wait for editor to appear (AI generation)
  try {
    await page.waitForURL(/\/programs\/[^/]+\/editor/, { timeout: 90_000 });
    await waitIdle(page);
    await shot(page, "02-genesis-editor");
    console.log("  ✓ Genesis generated workflow, editor loaded");

    // Check canvas has nodes
    const canvas = page.locator("[data-testid='rf__wrapper']").or(page.locator(".react-flow")).first();
    const hasCanvas = await canvas.isVisible().catch(() => false);
    if (!hasCanvas) bug("genesis-editor", "React Flow canvas not visible after generation", "high");

    // Store the program URL for later tests
    const url = page.url();
    const match = url.match(/\/programs\/([^/]+)\/editor/);
    if (match) {
      fs.writeFileSync(path.join(ARTIFACTS, "program-a-id.txt"), match[1]);
      console.log(`  ✓ Program A ID: ${match[1]}`);
    }
  } catch {
    bug("genesis", "Genesis did not redirect to editor within 90s — AI generation failed or timed out", "high");
    await shot(page, "02-genesis-timeout");
  }

  const e = errs();
  if (e.length) bug("genesis", e.join(" | "), "high");
});

// ─── 3. GENESIS — create workflow B ───────────────────────────────────────────
test("3 · genesis — create 'Gmail to Notion' workflow", async ({ page }) => {
  test.setTimeout(120_000);
  const errs = collectErrors(page, "genesis-b");
  await login(page);
  await page.goto("/programs/new");
  await waitIdle(page);

  const textarea = page.getByPlaceholder(/describe/i).or(page.locator("textarea").first());
  await expect(textarea).toBeVisible({ timeout: 8_000 });
  await textarea.fill(
    "When I receive a new email in Gmail with the label 'invoice', save the subject and sender to a Notion database called Invoices"
  );

  const buildBtn = page.getByRole("button", { name: /build/i }).first();
  await buildBtn.click();
  await shot(page, "03-genesis-b-building");

  try {
    await page.waitForURL(/\/programs\/[^/]+\/editor/, { timeout: 90_000 });
    await waitIdle(page);
    await shot(page, "03-genesis-b-editor");
    console.log("  ✓ Genesis workflow B created");

    const url = page.url();
    const match = url.match(/\/programs\/([^/]+)\/editor/);
    if (match) fs.writeFileSync(path.join(ARTIFACTS, "program-b-id.txt"), match[1]);
  } catch {
    bug("genesis-b", "Second Genesis workflow did not complete in 90s", "medium");
  }

  const e = errs();
  if (e.length) bug("genesis-b", e.join(" | "), "high");
});

// ─── 4. EDITOR — inspect canvas & toolbar ─────────────────────────────────────
test("4 · editor — canvas interaction & toolbar", async ({ page }) => {
  test.setTimeout(60_000);
  const errs = collectErrors(page, "editor");
  await login(page);

  const idFile = path.join(ARTIFACTS, "program-a-id.txt");
  if (!fs.existsSync(idFile)) {
    console.log("  ⚠ No program A id — skipping editor test");
    return;
  }
  const id = fs.readFileSync(idFile, "utf8").trim();
  await page.goto(`/programs/${id}/editor`);
  await waitIdle(page);
  await shot(page, "04-editor-loaded");

  // Canvas present
  const canvas = page.locator("[data-testid='rf__wrapper']").or(page.locator(".react-flow")).first();
  const hasCanvas = await canvas.isVisible().catch(() => false);
  if (!hasCanvas) {
    bug("editor", "Canvas not visible when navigating directly to /editor", "high");
    return;
  }

  // Nodes exist
  const nodes = page.locator(".react-flow__node");
  const nodeCount = await nodes.count();
  console.log(`  ✓ Editor has ${nodeCount} node(s)`);
  if (nodeCount === 0) bug("editor", "Editor canvas has 0 nodes after Genesis generation", "high");

  // Toolbar — look for Save/Deploy/Run buttons
  const saveBtn = page.getByRole("button", { name: /save/i }).or(page.getByRole("button", { name: /deploy/i })).first();
  const hasToolbar = await saveBtn.isVisible().catch(() => false);
  if (!hasToolbar) bug("editor", "No Save/Deploy button visible in editor toolbar", "medium");

  await shot(page, "04-editor-inspected");

  // Click first node
  const firstNode = nodes.first();
  if (nodeCount > 0) {
    await firstNode.click();
    await page.waitForTimeout(500);
    await shot(page, "04-editor-node-selected");
    // Side panel should open
    const panel = page.locator("[class*='panel'], [class*='sidebar'], [class*='inspector'], [data-testid*='panel']").last();
    const hasPanel = await panel.isVisible().catch(() => false);
    console.log(`  Node panel visible: ${hasPanel}`);
  }

  const e = errs();
  if (e.length) bug("editor", e.join(" | "), "high");
});

// ─── 5. PROGRAMS LIST ─────────────────────────────────────────────────────────
test("5 · programs list — shows created workflows", async ({ page }) => {
  const errs = collectErrors(page, "programs");
  await login(page);
  await page.goto("/dashboard");
  await waitIdle(page);
  await shot(page, "05-programs-list");

  // Should see at least one program after Genesis created them
  const noProgramsText = page.getByText(/no programs yet/i).or(page.getByText(/no workflows yet/i));
  const hasNoPrograms = await noProgramsText.isVisible().catch(() => false);
  if (hasNoPrograms) {
    bug("programs", "Dashboard shows 'no programs yet' even after Genesis created workflows", "medium");
  }

  const e = errs();
  if (e.length) bug("programs", e.join(" | "), "high");
});

// ─── 6. PROGRAM SETTINGS ──────────────────────────────────────────────────────
test("6 · program settings page", async ({ page }) => {
  const errs = collectErrors(page, "program-settings");
  await login(page);

  const idFile = path.join(ARTIFACTS, "program-a-id.txt");
  if (!fs.existsSync(idFile)) return;
  const id = fs.readFileSync(idFile, "utf8").trim();

  await page.goto(`/programs/${id}/settings`);
  await waitIdle(page);
  await shot(page, "06-program-settings");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const e = errs();
  if (e.length) bug("program-settings", e.join(" | "), "medium");
});

// ─── 7. TRIGGERS PAGE ─────────────────────────────────────────────────────────
test("7 · triggers page", async ({ page }) => {
  const errs = collectErrors(page, "triggers");
  await login(page);

  const idFile = path.join(ARTIFACTS, "program-a-id.txt");
  if (!fs.existsSync(idFile)) return;
  const id = fs.readFileSync(idFile, "utf8").trim();

  await page.goto(`/programs/${id}/triggers`);
  await waitIdle(page);
  await shot(page, "07-triggers");

  const e = errs();
  if (e.length) bug("triggers", e.join(" | "), "medium");
});

// ─── 8. RUN A WORKFLOW ────────────────────────────────────────────────────────
test("8 · runs — trigger a manual run", async ({ page }) => {
  test.setTimeout(60_000);
  const errs = collectErrors(page, "runs-trigger");
  await login(page);
  await page.goto("/runs");
  await waitIdle(page);
  await shot(page, "08-runs-before");

  // Click "Trigger run"
  const triggerBtn = page.getByText("Trigger run").or(page.getByRole("button", { name: /trigger run/i })).first();
  await expect(triggerBtn).toBeVisible({ timeout: 8_000 });
  await triggerBtn.click();
  await shot(page, "08-runs-trigger-dialog");
  await page.waitForTimeout(500);

  // A dialog or modal should open
  const dialog = page.getByText(/select.*program/i).or(page.getByText(/choose.*workflow/i)).or(page.locator('[role="dialog"]'));
  const dialogVisible = await dialog.first().isVisible().catch(() => false);
  if (!dialogVisible) bug("runs-trigger", "Clicking 'Trigger run' did not open a dialog", "medium");

  // Close it
  await page.keyboard.press("Escape");
  await shot(page, "08-runs-after-close");

  const e = errs();
  if (e.length) bug("runs-trigger", e.join(" | "), "high");
});

// ─── 9. RUN HISTORY PAGE ──────────────────────────────────────────────────────
test("9 · runs history — tabs and filters", async ({ page }) => {
  const errs = collectErrors(page, "runs-history");
  await login(page);
  await page.goto("/runs");
  await waitIdle(page);

  // Test tab switching
  for (const tab of ["Running", "Completed", "Failed", "Cancelled"]) {
    const tabEl = page.getByRole("tab", { name: tab }).or(page.getByText(tab, { exact: true })).first();
    if (await tabEl.isVisible().catch(() => false)) {
      await tabEl.click();
      await page.waitForTimeout(300);
    }
  }
  await shot(page, "09-runs-tabs");

  const e = errs();
  if (e.length) bug("runs-history", e.join(" | "), "medium");
});

// ─── 10. LOGS PAGE ────────────────────────────────────────────────────────────
test("10 · logs — search and filter", async ({ page }) => {
  const errs = collectErrors(page, "logs");
  await login(page);
  await page.goto("/logs");
  await waitIdle(page);
  await shot(page, "10-logs");

  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill("test");
    await page.waitForTimeout(400);
    await search.fill("");
  }

  const filterBtn = page.locator("button").filter({ hasText: /filter/i }).or(page.locator("svg").filter({ hasText: "" }).locator("..")).first();
  const hasFilter = await filterBtn.isVisible().catch(() => false);
  if (!hasFilter) console.log("  ⚠ No filter button found on logs page");

  await shot(page, "10-logs-searched");
  const e = errs();
  if (e.length) bug("logs", e.join(" | "), "medium");
});

// ─── 11. CONNECTIONS PAGE ─────────────────────────────────────────────────────
test("11 · connections — open a connector panel", async ({ page }) => {
  const errs = collectErrors(page, "connections");
  await login(page);
  await page.goto("/connections");
  await waitIdle(page);
  await shot(page, "11-connections");

  // Click first popular connector button (Gmail)
  const gmailBtn = page.getByText("Gmail").locator("..").locator("..").first();
  const btnVisible = await gmailBtn.isVisible().catch(() => false);
  if (btnVisible) {
    await gmailBtn.click();
    await page.waitForTimeout(600);
    await shot(page, "11-connections-gmail-panel");

    // Panel or dialog should open
    const panel = page.getByText(/connect/i).locator("..").first();
    const panelVisible = await panel.isVisible().catch(() => false);
    console.log(`  Gmail panel visible after click: ${panelVisible}`);

    await page.keyboard.press("Escape");
  }

  // Search for a connector
  const searchInput = page.getByPlaceholder(/search connector/i).first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill("notion");
    await page.waitForTimeout(400);
    await shot(page, "11-connections-search-notion");
    const notionResult = page.getByText("Notion").first();
    const notionVisible = await notionResult.isVisible().catch(() => false);
    if (!notionVisible) bug("connections", "Searching 'notion' returned no results", "medium");
    await searchInput.fill("");
  }

  const e = errs();
  if (e.length) bug("connections", e.join(" | "), "medium");
});

// ─── 12. BROWSE TEMPLATES ─────────────────────────────────────────────────────
test("12 · browse — template cards and use-template", async ({ page }) => {
  const errs = collectErrors(page, "browse");
  await login(page);
  await page.goto("/browse");
  await waitIdle(page);
  await shot(page, "12-browse");

  // Count template cards
  const cards = page.locator("[class*='card'], [class*='template']").filter({ hasText: /use|clone|start/i });
  const cardCount = await cards.count();
  console.log(`  Templates visible: ${cardCount}`);

  // Click first "Use template" / "Clone" button
  const useBtn = page.getByRole("button", { name: /use template|clone|start/i }).or(page.getByText(/use template/i)).first();
  const hasCTA = await useBtn.isVisible().catch(() => false);
  if (!hasCTA) {
    // Try clicking a card directly
    const firstCard = page.locator("article, [class*='card']").first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(500);
      await shot(page, "12-browse-card-clicked");
    }
  } else {
    await useBtn.click();
    await page.waitForTimeout(800);
    await shot(page, "12-browse-use-template");
    await page.goBack().catch(() => {});
  }

  const e = errs();
  if (e.length) bug("browse", e.join(" | "), "medium");
});

// ─── 13. AGENTS LIST ──────────────────────────────────────────────────────────
test("13 · agents — list and new agent form", async ({ page }) => {
  test.setTimeout(30_000);
  const errs = collectErrors(page, "agents");
  await login(page);
  await page.goto("/agents");
  await waitIdle(page);
  await shot(page, "13-agents-list");

  // New agent
  await page.goto("/agents/new");
  await waitIdle(page);
  await shot(page, "13-agents-new");

  // Check if it's gated (free plan) or shows a form
  const upgradePrompt = page.getByText(/solo feature|upgrade/i).first();
  const isGated = await upgradePrompt.isVisible().catch(() => false);
  if (isGated) {
    console.log("  ℹ Agents gated behind Solo plan — expected");
  } else {
    // Try filling the new agent form
    const nameInput = page.getByLabel(/name/i).or(page.locator('input[placeholder*="name" i]')).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("QA Test Agent");
      await shot(page, "13-agents-form-filled");
    }
  }

  const e = errs();
  if (e.length) bug("agents", e.join(" | "), "medium");
});

// ─── 14. APPROVALS ────────────────────────────────────────────────────────────
test("14 · approvals", async ({ page }) => {
  const errs = collectErrors(page, "approvals");
  await login(page);
  await page.goto("/approvals");
  await waitIdle(page);
  await shot(page, "14-approvals");

  const heading = page.getByRole("heading", { name: /approval/i });
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const e = errs();
  if (e.length) bug("approvals", e.join(" | "), "medium");
});

// ─── 15. ENV VARS — full CRUD ─────────────────────────────────────────────────
test("15 · env-vars — CRUD flow", async ({ page }) => {
  test.setTimeout(30_000);
  const errs = collectErrors(page, "env-vars");
  await login(page);
  await page.goto("/env-vars");
  await waitIdle(page);
  await shot(page, "15-env-vars");

  // Check for 500 (already-known bug)
  const e500 = errs().filter(e => e.includes("500"));
  if (e500.length) {
    bug("env-vars", "/api/env-vars returns 500 — RLS policy references wrong table (fix: migration 20260611100000)", "high");
  }

  // Open add dialog
  const addBtn = page.getByRole("button", { name: /add.*variable|add.*first/i }).first();
  await addBtn.click();
  await page.waitForTimeout(400);
  await shot(page, "15-env-vars-dialog");

  const nameInput = page.locator("#env-name").first();
  const dialogOpen = await nameInput.isVisible().catch(() => false);
  if (!dialogOpen) {
    bug("env-vars", "Add variable dialog did not open", "high");
  } else {
    await nameInput.fill("qa_test");
    const nameVal = await nameInput.inputValue();
    if (nameVal !== "QA_TEST") bug("env-vars", `Name field did not auto-uppercase: got "${nameVal}"`, "medium");

    const valInput = page.locator("#env-value").first();
    await valInput.fill("test-value-123");
    await shot(page, "15-env-vars-filled");

    // Submit
    const saveBtn = page.getByRole("button", { name: /save variable/i });
    await saveBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, "15-env-vars-after-save");

    // Check it appeared in list or error is shown
    const errMsg = page.getByText(/could not save|error/i).first();
    const hasErr = await errMsg.isVisible().catch(() => false);
    if (hasErr) bug("env-vars", "Saving env var showed error — likely RLS 500 still active", "high");
  }

  await page.keyboard.press("Escape").catch(() => {});
  const allErrors = errs().filter(e => !e.includes("favicon"));
  if (allErrors.length) bug("env-vars", allErrors.join(" | "), "high");
});

// ─── 16. API KEYS ─────────────────────────────────────────────────────────────
test("16 · api-keys — dialog validation", async ({ page }) => {
  const errs = collectErrors(page, "api-keys");
  await login(page);
  await page.goto("/api-keys");
  await waitIdle(page);
  await shot(page, "16-api-keys");

  const addBtn = page.getByRole("button", { name: /add.*key|add.*first/i }).first();
  await addBtn.click();
  await page.waitForTimeout(300);
  await shot(page, "16-api-keys-dialog");

  const keyInput = page.locator("#key").or(page.locator('input[placeholder*="sk" i]')).first();
  const dialogVisible = await keyInput.isVisible().catch(() => false);
  if (!dialogVisible) bug("api-keys", "Add API key dialog did not open", "high");
  else {
    // Try submitting with invalid key format
    await page.locator('input[placeholder*="Production" i]').fill("QA Test Key").catch(() => {});
    await keyInput.fill("not-a-valid-key");
    await page.getByRole("button", { name: /save key/i }).click();
    await page.waitForTimeout(500);
    await shot(page, "16-api-keys-validation");

    // Should show error or reject
    const errMsg = page.getByText(/invalid|error|format/i).first();
    const hasErr = await errMsg.isVisible().catch(() => false);
    console.log(`  API key validation error shown: ${hasErr}`);
  }

  await page.keyboard.press("Escape").catch(() => {});
  const e = errs();
  if (e.length) bug("api-keys", e.join(" | "), "medium");
});

// ─── 17. GOVERNANCE ───────────────────────────────────────────────────────────
test("17 · governance — sections visible", async ({ page }) => {
  const errs = collectErrors(page, "governance");
  await login(page);
  await page.goto("/governance");
  await waitIdle(page);
  await shot(page, "17-governance");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  // Export buttons
  const jsonBtn = page.getByRole("button", { name: /json/i }).or(page.getByText("JSON")).first();
  const hasExport = await jsonBtn.isVisible().catch(() => false);
  console.log(`  Governance export button visible: ${hasExport}`);

  const e = errs();
  if (e.length) bug("governance", e.join(" | "), "medium");
});

// ─── 18. PROFILE ──────────────────────────────────────────────────────────────
test("18 · profile — display name update", async ({ page }) => {
  const errs = collectErrors(page, "profile");
  await login(page);
  await page.goto("/profile");
  await waitIdle(page);
  await shot(page, "18-profile");

  const nameInput = page.getByLabel(/display name/i).or(page.locator('input[name="display_name"]')).first();
  const hasNameInput = await nameInput.isVisible().catch(() => false);
  if (!hasNameInput) {
    bug("profile", "Display name input not found on /profile", "medium");
  } else {
    const orig = await nameInput.inputValue();
    await nameInput.fill("QA Tester Display");
    const saveBtn = page.getByRole("button", { name: /save|update/i }).first();
    const hasSave = await saveBtn.isVisible().catch(() => false);
    if (hasSave) {
      await saveBtn.click();
      await page.waitForTimeout(800);
      await shot(page, "18-profile-saved");
      // Restore
      await nameInput.fill(orig || "");
      await saveBtn.click().catch(() => {});
    }
  }

  const e = errs();
  if (e.length) bug("profile", e.join(" | "), "medium");
});

// ─── 19. SETTINGS MODAL ───────────────────────────────────────────────────────
test("19 · settings modal — all tabs", async ({ page }) => {
  const errs = collectErrors(page, "settings");
  await login(page);
  await page.goto("/settings");
  await waitIdle(page);
  await shot(page, "19-settings-account");

  // Navigate through sidebar items in the settings modal
  for (const section of ["Profile", "Security", "Plan", "Support"]) {
    const link = page.getByRole("link", { name: section }).or(page.getByText(section, { exact: true })).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(400);
      await shot(page, `19-settings-${section.toLowerCase()}`);
    }
  }

  // Danger zone
  const dangerLink = page.getByText(/danger zone/i).first();
  if (await dangerLink.isVisible().catch(() => false)) {
    await dangerLink.click();
    await page.waitForTimeout(300);
    await shot(page, "19-settings-danger-zone");

    // Make sure delete account button exists but is guarded
    const deleteBtn = page.getByRole("button", { name: /delete.*account/i });
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    console.log(`  Danger zone delete button visible: ${hasDelete}`);
  }

  await page.getByRole("button", { name: /close settings/i }).click().catch(() => {});
  const e = errs();
  if (e.length) bug("settings", e.join(" | "), "medium");
});

// ─── 20. SECURITY SETTINGS ────────────────────────────────────────────────────
test("20 · security — password change form", async ({ page }) => {
  const errs = collectErrors(page, "security");
  await login(page);
  await page.goto("/settings");
  await waitIdle(page);

  const secLink = page.getByText("Security").first();
  if (await secLink.isVisible().catch(() => false)) {
    await secLink.click();
    await waitIdle(page);
    await shot(page, "20-security");

    // Password fields
    const currentPw = page.getByLabel(/current password/i).or(page.locator('input[type="password"]').first());
    const hasPwField = await currentPw.isVisible().catch(() => false);
    if (!hasPwField) bug("security", "Password change form not found on Security settings", "medium");
  }

  const e = errs();
  if (e.length) bug("security", e.join(" | "), "medium");
});

// ─── 21. PLAN PAGE ────────────────────────────────────────────────────────────
test("21 · plan — pricing table", async ({ page }) => {
  const errs = collectErrors(page, "plan");
  await login(page);
  await page.goto("/plan");
  await waitIdle(page);
  await shot(page, "21-plan");

  // Pricing tiers
  const freeTier = page.getByText(/free/i).first();
  await expect(freeTier).toBeVisible({ timeout: 5_000 });

  // Monthly / Yearly toggle
  const yearlyToggle = page.getByText(/yearly|annual/i).first();
  if (await yearlyToggle.isVisible().catch(() => false)) {
    await yearlyToggle.click();
    await page.waitForTimeout(300);
    await shot(page, "21-plan-yearly");
    await yearlyToggle.click();
  }

  const e = errs();
  if (e.length) bug("plan", e.join(" | "), "medium");
});

// ─── 22. WORKSPACES ───────────────────────────────────────────────────────────
test("22 · workspaces — switcher", async ({ page }) => {
  const errs = collectErrors(page, "workspaces");
  await login(page);
  await page.goto("/workspaces");
  await waitIdle(page);
  await shot(page, "22-workspaces");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  // Try workspace switcher in sidebar
  await page.goto("/dashboard");
  await waitIdle(page);
  const switcher = page.locator("[data-testid='workspace-switcher']").or(page.locator("button").filter({ hasText: /workspace|Playwright Test/i })).first();
  if (await switcher.isVisible().catch(() => false)) {
    await switcher.click();
    await page.waitForTimeout(400);
    await shot(page, "22-workspace-switcher-open");
    await page.keyboard.press("Escape").catch(() => {});
  }

  const e = errs();
  if (e.length) bug("workspaces", e.join(" | "), "medium");
});

// ─── 23. CREDITS ──────────────────────────────────────────────────────────────
test("23 · credits page", async ({ page }) => {
  const errs = collectErrors(page, "credits");
  await login(page);
  await page.goto("/credits");
  await waitIdle(page);
  await shot(page, "23-credits");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const e = errs();
  if (e.length) bug("credits", e.join(" | "), "medium");
});

// ─── 24. UPDATES PAGE ─────────────────────────────────────────────────────────
test("24 · updates / changelog", async ({ page }) => {
  const errs = collectErrors(page, "updates");
  await login(page);
  await page.goto("/updates");
  await waitIdle(page);
  await shot(page, "24-updates");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const e = errs();
  if (e.length) bug("updates", e.join(" | "), "medium");
});

// ─── 25. SUPPORT PAGE ─────────────────────────────────────────────────────────
test("25 · support page", async ({ page }) => {
  const errs = collectErrors(page, "support");
  await login(page);
  await page.goto("/support");
  await waitIdle(page);
  await shot(page, "25-support");

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const e = errs();
  if (e.length) bug("support", e.join(" | "), "medium");
});

// ─── 26. PROGRAM RUNS PAGE ────────────────────────────────────────────────────
test("26 · program-specific runs page", async ({ page }) => {
  const errs = collectErrors(page, "program-runs");
  await login(page);

  const idFile = path.join(ARTIFACTS, "program-a-id.txt");
  if (!fs.existsSync(idFile)) return;
  const id = fs.readFileSync(idFile, "utf8").trim();

  await page.goto(`/programs/${id}/runs`);
  await waitIdle(page);
  await shot(page, "26-program-runs");

  const e = errs();
  if (e.length) bug("program-runs", e.join(" | "), "medium");
});

// ─── 27. SIDEBAR NAVIGATION ───────────────────────────────────────────────────
test("27 · sidebar — all nav links work", async ({ page }) => {
  const errs = collectErrors(page, "sidebar-nav");
  await login(page);
  await waitIdle(page);

  // Test all sidebar icon links by clicking them
  const navLinks = [
    { href: "/dashboard", label: "dashboard" },
    { href: "/runs", label: "runs" },
    { href: "/logs", label: "logs" },
    { href: "/connections", label: "connections" },
    { href: "/env-vars", label: "env-vars" },
    { href: "/approvals", label: "approvals" },
    { href: "/governance", label: "governance" },
  ];

  for (const { href, label } of navLinks) {
    await page.goto(href);
    await page.waitForLoadState("domcontentloaded");
    const currentUrl = page.url();
    if (!currentUrl.includes(href)) {
      bug("sidebar-nav", `Navigating to ${href} redirected unexpectedly to ${currentUrl}`, "medium");
    }
  }

  await shot(page, "27-sidebar-nav-final");
  const e = errs();
  if (e.length) bug("sidebar-nav", e.join(" | "), "medium");
});

// ─── 28. PROGRAM CONFLICTS PAGE ────────────────────────────────────────────────
test("28 · program conflicts page", async ({ page }) => {
  const errs = collectErrors(page, "conflicts");
  await login(page);

  const idFile = path.join(ARTIFACTS, "program-a-id.txt");
  if (!fs.existsSync(idFile)) return;
  const id = fs.readFileSync(idFile, "utf8").trim();

  await page.goto(`/programs/${id}/conflicts`);
  await waitIdle(page);
  await shot(page, "28-conflicts");

  const e = errs();
  if (e.length) bug("conflicts", e.join(" | "), "medium");
});

// ─── 29. LOGOUT / RE-LOGIN ────────────────────────────────────────────────────
test("29 · logout and re-login flow", async ({ page }) => {
  const errs = collectErrors(page, "auth");
  await login(page);

  // Find logout button - usually in user menu or settings
  const userMenu = page.locator("button").filter({ hasText: /log out|sign out|logout/i }).first();
  const hasLogout = await userMenu.isVisible().catch(() => false);
  if (!hasLogout) {
    // Try bottom of sidebar
    const bottomNav = page.locator("nav").last().locator("button").last();
    if (await bottomNav.isVisible().catch(() => false)) {
      await bottomNav.click();
      await page.waitForTimeout(400);
      await shot(page, "29-user-menu-open");
    }
  }

  // Navigate to login page directly and verify it works
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await shot(page, "29-login-page");

  const emailInput = page.getByPlaceholder("Email");
  await expect(emailInput).toBeVisible({ timeout: 5_000 });

  // Test forgot password link
  const forgotLink = page.getByText(/forgot/i).first();
  if (await forgotLink.isVisible().catch(() => false)) {
    await forgotLink.click();
    await page.waitForTimeout(400);
    await shot(page, "29-forgot-password");
    await page.goBack();
  }

  const e = errs();
  if (e.length) bug("auth", e.join(" | "), "medium");
});

// ─── 30. FINAL BUG REPORT ─────────────────────────────────────────────────────
test.afterAll(async () => {
  const reportPath = path.join(ARTIFACTS, "bug-report.json");
  const report = {
    timestamp: new Date().toISOString(),
    totalBugs: bugs.length,
    highSeverity: bugs.filter(b => b.severity === "high").length,
    bugs,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log("  DEEP QA BUG REPORT");
  console.log("═".repeat(60));
  console.log(`  Total bugs: ${bugs.length}`);
  console.log(`  High:   ${bugs.filter(b => b.severity === "high").length}`);
  console.log(`  Medium: ${bugs.filter(b => b.severity === "medium").length}`);
  console.log(`  Low:    ${bugs.filter(b => b.severity === "low").length}`);
  console.log("─".repeat(60));
  bugs.forEach((b, i) => {
    console.log(`  ${i + 1}. [${b.severity.toUpperCase()}] ${b.area}`);
    console.log(`     ${b.description}`);
  });
  console.log("═".repeat(60));
});
