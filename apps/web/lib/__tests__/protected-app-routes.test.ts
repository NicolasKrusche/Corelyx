import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isProtectedAppPath,
  PROTECTED_APP_PREFIXES,
  ROUTE_GROUP_PREFIXES,
} from "@/lib/protected-app-routes";

const APP_DIR = path.resolve(__dirname, "../../app");

/** Top-level route segments a route group actually contains on disk. */
function routeSegments(group: string): string[] {
  return readdirSync(path.join(APP_DIR, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // Route groups `(x)` and private folders `_x` don't produce URL segments.
    .filter((entry) => !entry.name.startsWith("(") && !entry.name.startsWith("_"))
    .map((entry) => `/${entry.name}`)
    .sort();
}

describe("PROTECTED_APP_PREFIXES stays in sync with the route groups", () => {
  for (const group of Object.keys(ROUTE_GROUP_PREFIXES)) {
    it(`covers every route in ${group}`, () => {
      // A new signed-in page added without listing it here would stay reachable
      // during full maintenance — fail loudly instead.
      expect([...ROUTE_GROUP_PREFIXES[group]].sort()).toEqual(routeSegments(group));
    });
  }
});

describe("isProtectedAppPath", () => {
  it("matches signed-in app pages and their children", () => {
    expect(isProtectedAppPath("/dashboard")).toBe(true);
    expect(isProtectedAppPath("/programs/abc/editor")).toBe(true);
    expect(isProtectedAppPath("/settings/billing")).toBe(true);
    expect(isProtectedAppPath("/onboarding")).toBe(true);
    expect(isProtectedAppPath("/verify-2fa")).toBe(true);
  });

  it("does not match the public marketing site", () => {
    for (const publicPath of [
      "/",
      "/pricing",
      "/docs/getting-started",
      "/blog",
      "/privacy",
      "/terms",
      "/security",
      "/ai-governance-platform",
      "/u/someone",
    ]) {
      expect(isProtectedAppPath(publicPath)).toBe(false);
    }
  });

  it("only matches on a path boundary", () => {
    expect(isProtectedAppPath("/api-keys")).toBe(true);
    expect(isProtectedAppPath("/api-keysomething")).toBe(false);
    expect(isProtectedAppPath("/plans")).toBe(false);
  });

  it("has no duplicate prefixes", () => {
    expect(new Set(PROTECTED_APP_PREFIXES).size).toBe(PROTECTED_APP_PREFIXES.length);
  });
});
