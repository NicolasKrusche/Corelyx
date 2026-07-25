import { test as base, expect, type Page } from "@playwright/test";
import { TEST_USER, ROUTES } from "./test-data";

/**
 * Drive the login form directly. Used by auth.spec.ts (which tests the flow
 * itself) and available to any spec that needs a fresh, explicit login rather
 * than the cached storageState session.
 */
export async function login(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password,
): Promise<void> {
  await page.goto(ROUTES.login);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Collect browser console errors + failed requests for a page so a spec can
 * assert the flow produced no runtime errors. ERR_ABORTED is ignored: Next.js
 * cancels RSC/prefetch fetches on navigation and that is expected.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`PAGEERROR: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    const errorText = req.failure()?.errorText ?? "";
    if (errorText.includes("ERR_ABORTED")) return;
    errors.push(`NETWORK FAIL: ${req.url()} — ${errorText}`);
  });
  return errors;
}

/** Errors that are noise for our assertions (favicons, third-party analytics). */
export function filterIgnorableErrors(errors: string[]): string[] {
  return errors.filter(
    (e) => !e.includes("favicon") && !e.includes("analytics"),
  );
}

/**
 * `test` extended with the authenticated storageState already applied via the
 * project config. Re-exported so specs can `import { test, expect } from
 * "./fixtures/auth"` and get the shared helpers alongside.
 */
export const test = base;
export { expect, ROUTES, TEST_USER };
