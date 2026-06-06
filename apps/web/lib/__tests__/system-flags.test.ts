import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSystemFlags,
  invalidateSystemFlagsCache,
  isMaintenanceBypassAdmin,
  DEFAULT_SYSTEM_FLAGS,
} from "@/lib/system-flags";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAILS",
  "EMERGENCY_MAINTENANCE_MODE",
  "DISABLE_GENESIS_GENERATION",
  "DISABLE_WORKFLOW_EXECUTION",
] as const;

let savedEnv: Record<string, string | undefined>;

function mockFetchOnce(rows: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => rows,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  invalidateSystemFlagsCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
  invalidateSystemFlagsCache();
});

describe("readSystemFlags", () => {
  it("returns defaults and skips fetch when Supabase env is unset", async () => {
    const fetchMock = mockFetchOnce([]);
    const flags = await readSystemFlags(true);
    expect(flags).toEqual(DEFAULT_SYSTEM_FLAGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges the DB flags row over the defaults", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    mockFetchOnce([{ value: { maintenanceMode: true, maintenanceMessage: "Back soon" } }]);

    const flags = await readSystemFlags(true);
    expect(flags.maintenanceMode).toBe(true);
    expect(flags.maintenanceMessage).toBe("Back soon");
    // Unspecified keys keep their defaults.
    expect(flags.disableGenesis).toBe(false);
  });

  it("env override forces maintenance on even when the DB says off", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.EMERGENCY_MAINTENANCE_MODE = "true";
    mockFetchOnce([{ value: { maintenanceMode: false } }]);

    const flags = await readSystemFlags(true);
    expect(flags.maintenanceMode).toBe(true);
  });

  it("falls back to defaults when the DB read throws", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const flags = await readSystemFlags(true);
    expect(flags).toEqual(DEFAULT_SYSTEM_FLAGS);
  });

  it("caches reads and only refetches when forced", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const fetchMock = mockFetchOnce([{ value: { maintenanceMode: true } }]);

    await readSystemFlags(true); // 1st fetch
    await readSystemFlags(); // cached → no fetch
    await readSystemFlags(); // cached → no fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await readSystemFlags(true); // forced → refetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("isMaintenanceBypassAdmin", () => {
  it("allows an email on the ADMIN_EMAILS allow-list without a DB call", async () => {
    process.env.ADMIN_EMAILS = "founder@corelyx.app, dev@corelyx.app";
    const fetchMock = mockFetchOnce([]);
    expect(await isMaintenanceBypassAdmin("user-1", "Dev@Corelyx.app")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a founder/dev team_role via the profiles lookup", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    mockFetchOnce([{ is_admin: false, team_role: "dev" }]);
    expect(await isMaintenanceBypassAdmin("user-1", "someone@else.com")).toBe(true);
  });

  it("denies a regular user", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    mockFetchOnce([{ is_admin: false, team_role: "member" }]);
    expect(await isMaintenanceBypassAdmin("user-1", "someone@else.com")).toBe(false);
  });

  it("denies when there is no session user", async () => {
    expect(await isMaintenanceBypassAdmin(null, null)).toBe(false);
  });
});
