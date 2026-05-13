import { afterEach, describe, expect, it } from "vitest";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  isRuntimeDispatchConfigError,
  readRuntimeRejectionDetails,
  runtimeDispatchConfigError,
} from "../runtime-dispatch";
import { INTERNAL_SERVICE_TOKEN_HEADER } from "../internal-auth";

const scopedRuntimeExecuteSecret =
  "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE";
const originalScopedRuntimeExecuteSecret =
  process.env[scopedRuntimeExecuteSecret];
const originalInternalAuthSecret = process.env.INTERNAL_SERVICE_AUTH_SECRET;
const originalRuntimeSecret = process.env.RUNTIME_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalScopedRuntimeExecuteSecret === undefined) {
    delete process.env[scopedRuntimeExecuteSecret];
  } else {
    process.env[scopedRuntimeExecuteSecret] = originalScopedRuntimeExecuteSecret;
  }

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
});

describe("runtime dispatch", () => {
  it("builds signed runtime execute headers", () => {
    process.env[scopedRuntimeExecuteSecret] = "runtime-execute-secret";

    const headers = buildRuntimeExecuteHeaders("{}");

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBeTruthy();
  });

  it("classifies missing production runtime auth separately from reachability", async () => {
    mutableEnv.NODE_ENV = "production";
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "shared-secret";
    delete process.env[scopedRuntimeExecuteSecret];

    let thrown: unknown;
    try {
      buildRuntimeExecuteHeaders("{}");
    } catch (error) {
      thrown = error;
    }

    expect(isRuntimeDispatchConfigError(thrown)).toBe(true);
    const response = runtimeDispatchConfigError(thrown);
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Runtime auth is not configured",
    });
  });

  it("extracts runtime rejection details from JSON responses", async () => {
    const details = await readRuntimeRejectionDetails(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        statusText: "Unauthorized",
      })
    );

    expect(details).toEqual({ status: 401, detail: "Unauthorized" });
    expect(formatRuntimeRejection(details)).toBe(
      "Runtime rejected execution (401): Unauthorized"
    );
  });
});
