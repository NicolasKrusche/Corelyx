import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { readSystemFlags } from "@/lib/system-flags";
import { activeDisabledAreaKeys, getMaintenanceArea } from "@/lib/maintenance-areas";

/**
 * Sticky warning shown to admins while maintenance is active. Regular users
 * never see this — during full maintenance they're blocked entirely, and during
 * scoped maintenance the banner would only confuse them. It exists so a dev
 * browsing the app (via the admin bypass) has a constant reminder that
 * maintenance is on and which parts are down.
 */
export async function MaintenanceAdminBanner({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return null;

  const flags = await readSystemFlags();
  const areaKeys = activeDisabledAreaKeys(flags);
  if (!flags.maintenanceMode && areaKeys.length === 0) return null;

  const fullMaintenance = flags.maintenanceMode;
  const areaLabels = areaKeys
    .map((k) => getMaintenanceArea(k)?.label ?? k)
    .join(", ");

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm ${
        fullMaintenance
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
      role="status"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">
        {fullMaintenance ? "Maintenance mode is ON" : "Partial maintenance is ON"}
      </span>
      <span className="opacity-90">
        {fullMaintenance
          ? "Regular users are blocked from the whole app. You can still browse because you're an admin."
          : `Disabled for users: ${areaLabels}. You can still use these because you're an admin.`}
      </span>
      <Link
        href="/admin/emergency"
        className="ml-auto whitespace-nowrap font-medium underline underline-offset-2 hover:opacity-80"
      >
        Manage
      </Link>
    </div>
  );
}
