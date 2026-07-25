import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_USER, ROUTES } from "./test-data";
import { STORAGE_STATE } from "../playwright.config";

/**
 * One-time authentication.
 *
 * Runs before the browser projects (declared as their `dependencies`) and
 * persists the logged-in session to STORAGE_STATE. Every spec then starts
 * already signed in instead of re-driving the login form.
 */
setup("authenticate", async ({ page }) => {
  await page.goto(ROUTES.login);

  await page.getByPlaceholder("Email").fill(TEST_USER.email);
  await page.getByPlaceholder("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // A successful email/password login redirects to /dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
