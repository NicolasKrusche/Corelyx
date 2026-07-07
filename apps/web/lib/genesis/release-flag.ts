import "server-only";

import { createServiceClient } from "@/lib/api";

/**
 * Admin-controlled Genesis V2 release announcement. Backed by the
 * `system_settings` table (key `genesis_v2_release`) so it can be toggled at
 * runtime from the admin panel without a redeploy — mirrors how the other
 * runtime flags are stored. `version` lets an admin re-show the announcement to
 * everyone (bump it) even if they already dismissed a prior version.
 */

const SETTINGS_KEY = "genesis_v2_release";

export type GenesisReleaseState = {
  active: boolean;
  version: number;
};

const DEFAULT_STATE: GenesisReleaseState = { active: false, version: 1 };

function normalize(value: unknown): GenesisReleaseState {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE };
  const v = value as Record<string, unknown>;
  return {
    active: v.active === true,
    version: typeof v.version === "number" && v.version > 0 ? Math.floor(v.version) : 1,
  };
}

export async function getGenesisReleaseState(): Promise<GenesisReleaseState> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("system_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    return normalize((data as { value?: unknown } | null)?.value);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function setGenesisReleaseState(
  patch: { active?: boolean; bumpVersion?: boolean }
): Promise<GenesisReleaseState> {
  const db = createServiceClient();
  const current = await getGenesisReleaseState();
  const next: GenesisReleaseState = {
    active: patch.active ?? current.active,
    version: patch.bumpVersion ? current.version + 1 : current.version,
  };
  await db
    .from("system_settings")
    .upsert(
      { key: SETTINGS_KEY, value: next as unknown as Record<string, unknown> } as unknown as never,
      { onConflict: "key" }
    );
  return next;
}
