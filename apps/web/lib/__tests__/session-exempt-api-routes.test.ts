import { describe, expect, it } from "vitest";
import { isSessionExemptApiRoute } from "@/lib/session-exempt-api-routes";

describe("session-exempt API routes", () => {
  it("allows route-authenticated server-to-server entrypoints through middleware", () => {
    expect(isSessionExemptApiRoute("/api/triggers/event")).toBe(true);
    expect(isSessionExemptApiRoute("/api/triggers/webhook/opaque-token")).toBe(true);
    expect(isSessionExemptApiRoute("/api/webhooks/gmail")).toBe(true);
    expect(isSessionExemptApiRoute("/api/billing/webhook")).toBe(true);
    expect(isSessionExemptApiRoute("/api/inngest")).toBe(true);
  });

  it("does not exempt browser-session API routes", () => {
    expect(isSessionExemptApiRoute("/api/runs")).toBe(false);
    expect(isSessionExemptApiRoute("/api/billing/checkout")).toBe(false);
    expect(isSessionExemptApiRoute("/api/connections")).toBe(false);
  });
});
