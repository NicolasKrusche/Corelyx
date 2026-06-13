import { describe, expect, it } from "vitest";
import { isTwoFactorExemptApiPath } from "@/lib/auth/two-factor-api-exempt";

describe("two-factor API exemption", () => {
  it("exempts the post-login provisioning route (runs before a 2FA cookie can exist)", () => {
    expect(isTwoFactorExemptApiPath("/api/auth/post-login")).toBe(true);
  });

  it("does NOT exempt ordinary cookie-session API routes", () => {
    expect(isTwoFactorExemptApiPath("/api/runs")).toBe(false);
    expect(isTwoFactorExemptApiPath("/api/workspaces")).toBe(false);
    expect(isTwoFactorExemptApiPath("/api/connections")).toBe(false);
    expect(isTwoFactorExemptApiPath("/api/agents")).toBe(false);
  });

  it("does not exempt by prefix — only the exact post-login path", () => {
    expect(isTwoFactorExemptApiPath("/api/auth/post-login/extra")).toBe(false);
    expect(isTwoFactorExemptApiPath("/api/auth")).toBe(false);
    expect(isTwoFactorExemptApiPath("/api/auth/two-factor/verify")).toBe(false);
  });
});
