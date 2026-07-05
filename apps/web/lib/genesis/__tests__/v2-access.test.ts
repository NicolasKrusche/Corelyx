import { afterEach, describe, expect, it, vi } from "vitest";

// The gate delegates the "is this user a dev" decision to hasTechnicalAccess;
// mock it so we can assert the flag logic without a DB.
const hasTechnicalAccess = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ hasTechnicalAccess: (...args: unknown[]) => hasTechnicalAccess(...args) }));

import { isGenesisV2Enabled } from "../v2-access";

afterEach(() => hasTechnicalAccess.mockReset());

describe("isGenesisV2Enabled", () => {
  it("returns false and never checks access when the flag is not set", async () => {
    expect(await isGenesisV2Enabled("u1", "a@b.com", undefined)).toBe(false);
    expect(await isGenesisV2Enabled("u1", "a@b.com", false)).toBe(false);
    expect(hasTechnicalAccess).not.toHaveBeenCalled();
  });

  it("requires BOTH the flag and technical access", async () => {
    hasTechnicalAccess.mockResolvedValueOnce(true);
    expect(await isGenesisV2Enabled("u1", "dev@corelyx.app", true)).toBe(true);

    hasTechnicalAccess.mockResolvedValueOnce(false);
    expect(await isGenesisV2Enabled("u2", "user@example.com", true)).toBe(false);
  });
});
