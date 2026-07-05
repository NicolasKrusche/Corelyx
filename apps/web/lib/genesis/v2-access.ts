import "server-only";

import { hasTechnicalAccess } from "@/lib/admin-auth";

/**
 * Genesis V2 is dev-gated for now. It is enabled for a request only when BOTH:
 *   1. the request opted in (genesis_v2: true), and
 *   2. the user has technical access (ADMIN_EMAILS or team_role founder/dev).
 *
 * A non-dev request that sets the flag is silently treated as V1 — the toggle
 * is hidden for non-dev users, and this is the server-side backstop so the flag
 * can never be forged into V2 behavior. Every V2 behavior (introspection,
 * patch refinement, clarifying questions) checks this single boolean.
 */
export async function isGenesisV2Enabled(
  userId: string,
  email: string | null | undefined,
  requested: boolean | undefined
): Promise<boolean> {
  if (requested !== true) return false;
  return hasTechnicalAccess(userId, email);
}
