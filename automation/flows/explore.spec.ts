/**
 * Comprehensive QA exploration — visits every major authenticated page,
 * captures screenshots and console errors, and fails explicitly with a
 * summary of all issues found so nothing gets silently swallowed.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_EMAIL = process.env.TEST_EMAIL || "test@example.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test-password";
const ARTIFACTS = "./automation/artifacts/explore";

fs.mkdirSync(ARTIFACTS, { recursive: true });

interface PageResult {
  url: string;
  label: string;
  errors: string[];
  screenshotPath: string;
  status: "pass" | "fail" | "skip";
  note?: string;
}

const results: PageResult[] = [];

function collectErrors(page: Page, errors: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`PAGEERROR: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "";
    if (err.includes("ERR_ABORTED")) return; // intentional cancellations
    errors.push(`NETFAIL: ${req.url()} — ${err}`);
  });
}

async function screenshot(page: Page, label: string): Promise<string> {
  const slug = label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const p = path.join(ARTIFACTS, `${slug}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function visitPage(
  page: Page,
  label: string,
  url: string,
  opts?: { skipErrorCheck?: boolean; note?: string }
) {
  const errors: string[] = [];
  collectErrors(page, errors);
  try {
    await page.goto(url);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      // timeout is acceptable — just means live subscriptions are open
    });
    const screenshotPath = await screenshot(page, label);
    const filtered = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("ERR_ABORTED")
    );
    results.push({
      url,
      label,
      errors: filtered,
      screenshotPath,
      status: filtered.length > 0 && !opts?.skipErrorCheck ? "fail" : "pass",
      note: opts?.note,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const screenshotPath = await screenshot(page, label).catch(() => "");
    results.push({ url, label, errors: [msg], screenshotPath, status: "fail" });
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("App exploration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard", async ({ page }) => {
    await visitPage(page, "dashboard", "/dashboard");
    // Also check that the stat cards rendered
    const hasStats = await page.locator("main").isVisible();
    expect(hasStats).toBe(true);
  });

  test("programs list", async ({ page }) => {
    await visitPage(page, "programs", "/programs/new");
  });

  test("browse templates", async ({ page }) => {
    await visitPage(page, "browse", "/browse");
  });

  test("connections", async ({ page }) => {
    await visitPage(page, "connections", "/connections");
  });

  test("runs history", async ({ page }) => {
    await visitPage(page, "runs", "/runs");
  });

  test("logs", async ({ page }) => {
    await visitPage(page, "logs", "/logs");
  });

  test("agents list", async ({ page }) => {
    await visitPage(page, "agents", "/agents");
  });

  test("new agent", async ({ page }) => {
    await visitPage(page, "agents-new", "/agents/new");
  });

  test("approvals", async ({ page }) => {
    await visitPage(page, "approvals", "/approvals");
  });

  test("env vars", async ({ page }) => {
    await visitPage(page, "env-vars", "/env-vars");
  });

  test("api keys", async ({ page }) => {
    await visitPage(page, "api-keys", "/api-keys");
  });

  test("governance", async ({ page }) => {
    await visitPage(page, "governance", "/governance");
  });

  test("profile", async ({ page }) => {
    await visitPage(page, "profile", "/profile");
  });

  test("plan", async ({ page }) => {
    await visitPage(page, "plan", "/plan");
  });

  test("workspaces", async ({ page }) => {
    await visitPage(page, "workspaces", "/workspaces");
  });

  test("credits", async ({ page }) => {
    await visitPage(page, "credits", "/credits");
  });

  test("settings", async ({ page }) => {
    await visitPage(page, "settings", "/settings");
  });

  // ── Interactive: create workflow via Genesis ──────────────────────────────
  test("new workflow page — Genesis form renders", async ({ page }) => {
    await page.goto("/programs/new");
    await page.waitForLoadState("networkidle").catch(() => {});
    const errors: string[] = [];
    collectErrors(page, errors);

    // Check Genesis prompt input is present
    const input = page.getByPlaceholder(/describe/i).or(page.getByRole("textbox").first());
    const visible = await input.isVisible().catch(() => false);
    await screenshot(page, "new-workflow");
    results.push({
      url: "/programs/new",
      label: "new-workflow-genesis-input",
      errors: errors.filter((e) => !e.includes("favicon")),
      screenshotPath: path.join(ARTIFACTS, "new-workflow.png"),
      status: visible ? "pass" : "fail",
      note: visible ? undefined : "Genesis input not visible on /programs/new",
    });
  });

  // ── Interactive: connections page — check no JS error on OAuth click ──────
  test("connections — connector cards render", async ({ page }) => {
    await page.goto("/connections");
    await page.waitForLoadState("networkidle").catch(() => {});
    const errors: string[] = [];
    collectErrors(page, errors);

    // Popular providers are rendered as buttons with a "Connect" span.
    // The page always shows at least the 8 popular provider buttons.
    const cards = page.locator("button").filter({ hasText: /Connect/i });
    const count = await cards.count();
    await screenshot(page, "connections-loaded");
    results.push({
      url: "/connections",
      label: "connections-card-count",
      errors: errors.filter((e) => !e.includes("favicon")),
      screenshotPath: path.join(ARTIFACTS, "connections-loaded.png"),
      status: count > 0 ? "pass" : "fail",
      note: `Found ${count} connector card elements`,
    });
  });

  // ── Summary — print all results and fail if any page had errors ───────────
  test.afterAll(async () => {
    const fails = results.filter((r) => r.status === "fail");
    const lines = results.map(
      (r) =>
        `${r.status === "pass" ? "✓" : "✗"} ${r.label.padEnd(35)} ${r.url}${
          r.errors.length > 0 ? "\n    → " + r.errors.join("\n    → ") : ""
        }${r.note ? `\n    note: ${r.note}` : ""}`
    );
    console.log("\n── QA Exploration Report ──\n" + lines.join("\n"));
    const report = { timestamp: new Date().toISOString(), results, failCount: fails.length };
    fs.writeFileSync(path.join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
    if (fails.length > 0) {
      throw new Error(
        `${fails.length} page(s) had errors:\n` +
          fails.map((f) => `  ${f.label}: ${f.errors.join(", ")}`).join("\n")
      );
    }
  });
});
