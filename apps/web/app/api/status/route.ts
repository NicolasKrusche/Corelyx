import { NextResponse } from "next/server";
import { readSystemFlags } from "@/lib/system-flags";
import { activeDisabledAreaKeys } from "@/lib/maintenance-areas";

export const dynamic = "force-dynamic";

/**
 * GET /api/status?area=<key>
 *
 * Lightweight, unauthenticated maintenance probe. Exempt from the maintenance
 * gate (see EXEMPT_PREFIXES) so the maintenance page can poll it while the rest
 * of the app is blocked, and reload itself the moment maintenance clears.
 *
 * Returns { maintenance: boolean } — true while the user would still be blocked
 * for the given scope (full maintenance, or the named area), false when clear.
 */
export async function GET(request: Request) {
  const flags = await readSystemFlags();
  const area = new URL(request.url).searchParams.get("area");

  const maintenance = flags.maintenanceMode
    ? true
    : area
      ? activeDisabledAreaKeys(flags).includes(area)
      : false;

  return NextResponse.json(
    { maintenance },
    { headers: { "Cache-Control": "no-store" } }
  );
}
