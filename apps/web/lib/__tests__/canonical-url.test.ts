import { afterEach, describe, expect, it } from "vitest";
import { canonicalAppOrigin, canonicalWebhookUrl } from "@/lib/canonical-url";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("canonicalAppOrigin", () => {
  it("rewrites the redirecting apex host to the canonical www host", () => {
    // The apex 308-redirects to www, and webhook senders do not follow redirects.
    expect(canonicalAppOrigin("https://corelyx.app")).toBe("https://www.corelyx.app");
  });

  it("leaves the canonical www host unchanged", () => {
    expect(canonicalAppOrigin("https://www.corelyx.app")).toBe("https://www.corelyx.app");
  });

  it("strips any path or trailing slash down to the origin", () => {
    expect(canonicalAppOrigin("https://corelyx.app/api/webhooks/gmail/")).toBe(
      "https://www.corelyx.app"
    );
  });

  it("upgrades a non-local host to https so the URL does not itself redirect", () => {
    expect(canonicalAppOrigin("http://corelyx.app")).toBe("https://www.corelyx.app");
  });

  it("passes localhost through untouched for local development", () => {
    expect(canonicalAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("falls back to the canonical origin when the value is missing or unparseable", () => {
    expect(canonicalAppOrigin(undefined)).toBe("https://www.corelyx.app");
    expect(canonicalAppOrigin("not a url")).toBe("https://www.corelyx.app");
  });
});

describe("canonicalWebhookUrl", () => {
  it("builds a canonical, redirect-free webhook URL from an apex base", () => {
    expect(canonicalWebhookUrl("/api/webhooks/gmail", "https://corelyx.app")).toBe(
      "https://www.corelyx.app/api/webhooks/gmail"
    );
  });

  it("reads NEXT_PUBLIC_APP_URL when no base is passed", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://corelyx.app";
    expect(canonicalWebhookUrl("/api/webhooks/github")).toBe(
      "https://www.corelyx.app/api/webhooks/github"
    );
  });

  it("tolerates a path without a leading slash", () => {
    expect(canonicalWebhookUrl("api/webhooks/sheets", "https://www.corelyx.app")).toBe(
      "https://www.corelyx.app/api/webhooks/sheets"
    );
  });
});
