import { afterEach, describe, expect, it, vi } from "vitest";
import { allowsDevSecretFallback } from "@/lib/secret-fallback";

const ENV_KEYS = ["NODE_ENV", "VERCEL_ENV", "APP_ENV", "RUNTIME_ENV"] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      vi.stubEnv(key, "");
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
}

describe("allowsDevSecretFallback (fail-closed)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the fallback in explicit dev/test environments", () => {
    setEnv({ NODE_ENV: "development" });
    expect(allowsDevSecretFallback()).toBe(true);
    setEnv({ NODE_ENV: "test" });
    expect(allowsDevSecretFallback()).toBe(true);
    setEnv({ NODE_ENV: undefined, RUNTIME_ENV: "local" });
    expect(allowsDevSecretFallback()).toBe(true);
  });

  it("refuses the fallback in production", () => {
    setEnv({ NODE_ENV: "production" });
    expect(allowsDevSecretFallback()).toBe(false);
  });

  it("refuses the fallback when any marker is production, even if another is dev", () => {
    setEnv({ NODE_ENV: "development", VERCEL_ENV: "production" });
    expect(allowsDevSecretFallback()).toBe(false);
  });

  it("fails closed when the environment is unset/unknown", () => {
    setEnv({});
    expect(allowsDevSecretFallback()).toBe(false);
    setEnv({ APP_ENV: "staging" });
    expect(allowsDevSecretFallback()).toBe(false);
    setEnv({ VERCEL_ENV: "preview" });
    expect(allowsDevSecretFallback()).toBe(false);
  });
});
