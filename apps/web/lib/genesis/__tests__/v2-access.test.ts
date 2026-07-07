import { afterEach, describe, expect, it, vi } from "vitest";

// The gate delegates "is this user a dev" to hasTechnicalAccess and "what plan"
// to getUserTier; mock both so we can assert the access logic without a DB.
const hasTechnicalAccess = vi.fn();
const getUserTier = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ hasTechnicalAccess: (...args: unknown[]) => hasTechnicalAccess(...args) }));
vi.mock("@/lib/limits", () => ({ getUserTier: (...args: unknown[]) => getUserTier(...args) }));

import { hasGenesisV2Access, isGenesisV2Enabled } from "../v2-access";

afterEach(() => {
  hasTechnicalAccess.mockReset();
  getUserTier.mockReset();
});

describe("hasGenesisV2Access", () => {
  it("grants dev accounts regardless of plan (and doesn't check the plan)", async () => {
    hasTechnicalAccess.mockResolvedValue(true);
    expect(await hasGenesisV2Access("u1", "dev@corelyx.app")).toBe(true);
    expect(getUserTier).not.toHaveBeenCalled();
  });

  it("grants the top plans (builder/unlimited) but not lower ones", async () => {
    hasTechnicalAccess.mockResolvedValue(false);

    getUserTier.mockResolvedValueOnce("builder");
    expect(await hasGenesisV2Access("u2", "scale@example.com")).toBe(true);

    getUserTier.mockResolvedValueOnce("unlimited");
    expect(await hasGenesisV2Access("u3", "vip@example.com")).toBe(true);

    getUserTier.mockResolvedValueOnce("pro");
    expect(await hasGenesisV2Access("u4", "team@example.com")).toBe(false);

    getUserTier.mockResolvedValueOnce("free");
    expect(await hasGenesisV2Access("u5", "free@example.com")).toBe(false);
  });
});

describe("isGenesisV2Enabled", () => {
  it("returns false and never checks access when the flag is not set", async () => {
    expect(await isGenesisV2Enabled("u1", "a@b.com", undefined)).toBe(false);
    expect(await isGenesisV2Enabled("u1", "a@b.com", false)).toBe(false);
    expect(hasTechnicalAccess).not.toHaveBeenCalled();
    expect(getUserTier).not.toHaveBeenCalled();
  });

  it("requires the flag AND access (dev or top plan)", async () => {
    hasTechnicalAccess.mockResolvedValueOnce(true);
    expect(await isGenesisV2Enabled("u1", "dev@corelyx.app", true)).toBe(true);

    hasTechnicalAccess.mockResolvedValueOnce(false);
    getUserTier.mockResolvedValueOnce("free");
    expect(await isGenesisV2Enabled("u2", "user@example.com", true)).toBe(false);
  });
});
