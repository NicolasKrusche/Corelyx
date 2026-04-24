import { afterEach, describe, expect, it } from "vitest";
import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  buildInternalServiceHeaders,
  createInternalServiceToken,
  requestHasValidInternalServiceToken,
  verifyInternalServiceToken,
} from "../internal-auth";

const originalInternalAuthSecret = process.env.INTERNAL_SERVICE_AUTH_SECRET;
const originalRuntimeSecret = process.env.RUNTIME_SECRET;

afterEach(() => {
  if (originalInternalAuthSecret === undefined) {
    delete process.env.INTERNAL_SERVICE_AUTH_SECRET;
  } else {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = originalInternalAuthSecret;
  }

  if (originalRuntimeSecret === undefined) {
    delete process.env.RUNTIME_SECRET;
  } else {
    process.env.RUNTIME_SECRET = originalRuntimeSecret;
  }
});

describe("internal auth", () => {
  it("creates short-lived tokens that verify for the expected audience", () => {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "internal-auth-test-secret";

    const token = createInternalServiceToken("runtime:execute", {
      nowMs: 1_000_000,
      ttlSeconds: 60,
    });

    expect(
      verifyInternalServiceToken(token, "runtime:execute", {
        nowMs: 1_020_000,
      })
    ).toBe(true);
    expect(
      verifyInternalServiceToken(token, "next:vault", {
        nowMs: 1_020_000,
      })
    ).toBe(false);
  });

  it("rejects expired tokens and validates request headers", () => {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "internal-auth-test-secret";

    const headers = buildInternalServiceHeaders("next:runs:complete");
    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBeTruthy();
    expect(
      requestHasValidInternalServiceToken(headers, "next:runs:complete")
    ).toBe(true);

    const expiredToken = createInternalServiceToken("runtime:execute", {
      nowMs: 1_000_000,
      ttlSeconds: 60,
    });
    expect(
      verifyInternalServiceToken(expiredToken, "runtime:execute", {
        nowMs: 1_400_000,
      })
    ).toBe(false);
  });
});
