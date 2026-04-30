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
const originalNodeEnv = process.env.NODE_ENV;
const scopedRuntimeExecuteSecret =
  "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE";
const scopedRunsCompleteSecret =
  "INTERNAL_SERVICE_AUTH_SECRET_NEXT_RUNS_COMPLETE";
const originalScopedRuntimeExecuteSecret =
  process.env[scopedRuntimeExecuteSecret];
const originalScopedRunsCompleteSecret = process.env[scopedRunsCompleteSecret];
const mutableEnv = process.env as Record<string, string | undefined>;

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

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }

  if (originalScopedRuntimeExecuteSecret === undefined) {
    delete process.env[scopedRuntimeExecuteSecret];
  } else {
    process.env[scopedRuntimeExecuteSecret] = originalScopedRuntimeExecuteSecret;
  }

  if (originalScopedRunsCompleteSecret === undefined) {
    delete process.env[scopedRunsCompleteSecret];
  } else {
    process.env[scopedRunsCompleteSecret] = originalScopedRunsCompleteSecret;
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
    ).not.toBeNull();
    expect(
      verifyInternalServiceToken(token, "next:vault", {
        nowMs: 1_020_000,
      })
    ).toBeNull();
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
    ).toBeNull();
  });

  it("requires scoped secrets in production", () => {
    mutableEnv.NODE_ENV = "production";
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "shared-secret";
    delete process.env[scopedRuntimeExecuteSecret];

    expect(() => createInternalServiceToken("runtime:execute")).toThrow(
      scopedRuntimeExecuteSecret
    );

    process.env[scopedRuntimeExecuteSecret] = "runtime-execute-secret";
    process.env[scopedRunsCompleteSecret] = "runs-complete-secret";

    const token = createInternalServiceToken("runtime:execute", {
      nowMs: 1_000_000,
      ttlSeconds: 60,
    });
    expect(
      verifyInternalServiceToken(token, "runtime:execute", {
        nowMs: 1_020_000,
      })
    ).not.toBeNull();
    expect(
      verifyInternalServiceToken(token, "next:runs:complete", {
        nowMs: 1_020_000,
      })
    ).toBeNull();
  });

  it("propagates the subject claim and rejects tampering", () => {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "internal-auth-test-secret";

    const token = createInternalServiceToken("next:vault", {
      nowMs: 1_000_000,
      ttlSeconds: 60,
      subject: "user-abc",
    });
    const claims = verifyInternalServiceToken(token, "next:vault", {
      nowMs: 1_020_000,
    });
    expect(claims?.sub).toBe("user-abc");

    // A token without a subject still verifies (back-compat) but exposes no sub.
    const anonToken = createInternalServiceToken("next:vault", {
      nowMs: 1_000_000,
      ttlSeconds: 60,
    });
    const anonClaims = verifyInternalServiceToken(anonToken, "next:vault", {
      nowMs: 1_020_000,
    });
    expect(anonClaims?.sub).toBeUndefined();
  });

  it("binds tokens to method, path, and body when requested", () => {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "internal-auth-test-secret";
    const body = JSON.stringify({ run_id: "run-1" });

    const token = createInternalServiceToken("runtime:execute", {
      nowMs: 1_000_000,
      ttlSeconds: 30,
      method: "POST",
      path: "/execute",
      body,
    });

    expect(
      verifyInternalServiceToken(token, "runtime:execute", {
        nowMs: 1_010_000,
        method: "POST",
        path: "/execute",
        body,
      })
    ).not.toBeNull();
    expect(
      verifyInternalServiceToken(token, "runtime:execute", {
        nowMs: 1_010_000,
        method: "POST",
        path: "/execute",
        body: JSON.stringify({ run_id: "other-run" }),
      })
    ).toBeNull();
  });
});
