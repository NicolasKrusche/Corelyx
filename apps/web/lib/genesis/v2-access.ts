import "server-only";

import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";

/**
 * Who may use Genesis V2. Because V2 defaults to a strong (expensive) model, it
 * is gated to the top plan(s) (entitlements.genesisV2 — Scale/unlimited) plus
 * dev accounts (ADMIN_EMAILS or team_role founder/dev) for testing.
 */
export async function hasGenesisV2Access(
  userId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (await hasTechnicalAccess(userId, email)) return true;
  const tier = await getUserTier(userId);
  return getEntitlements(tier).genesisV2;
}

/**
 * Whether V2 behaviors run for a request: the request opted in (genesis_v2:
 * true) AND the user has V2 access. A request that sets the flag without access
 * is silently treated as V1 — the server-side backstop so the flag can't be
 * forged into V2 behavior. Every V2 behavior checks this single boolean.
 */
export async function isGenesisV2Enabled(
  userId: string,
  email: string | null | undefined,
  requested: boolean | undefined
): Promise<boolean> {
  if (requested !== true) return false;
  return hasGenesisV2Access(userId, email);
}
