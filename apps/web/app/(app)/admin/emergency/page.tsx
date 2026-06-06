import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { readSystemFlags, type SystemFlags } from "@/lib/system-flags";
import { setSystemFlags } from "@/lib/system-flags-server";
import { MAINTENANCE_AREAS, activeDisabledAreaKeys } from "@/lib/maintenance-areas";
import { revalidatePath } from "next/cache";
import { AlertTriangle, Power, Shield, AlertCircle } from "lucide-react";

async function getCurrentStatus() {
  // Force a fresh read so the page reflects the toggle immediately after a write.
  const flags = await readSystemFlags(true);
  return {
    maintenanceMode: flags.maintenanceMode,
    disabledAreas: new Set(activeDisabledAreaKeys(flags)),
  };
}

async function assertAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasTechnicalAccess(user.id, user.email))) {
    throw new Error("Unauthorized");
  }
  return user;
}

// Persist flags, surfacing any failure as an inline error on the page instead
// of letting it bubble up to the app-wide error boundary (a crash here is the
// worst time to lose the emergency controls).
async function persist(patch: Partial<SystemFlags>, userId: string) {
  let err: string | null = null;
  try {
    await setSystemFlags(patch, userId);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to update system flags.";
  }
  if (err) redirect(`/admin/emergency?error=${encodeURIComponent(err)}`);
  revalidatePath("/admin/emergency");
  redirect("/admin/emergency"); // clear any stale ?error from the URL
}

// Persist a flag change to the DB-backed system_settings row. Re-authenticates
// (never trusts the page render) before writing.
async function applyFlag(patch: Partial<SystemFlags>) {
  "use server";
  const user = await assertAdmin();
  await persist(patch, user.id);
}

// Enable/disable a single app area (scoped maintenance).
async function toggleArea(key: string, disabled: boolean) {
  "use server";
  const user = await assertAdmin();
  const flags = await readSystemFlags(true);
  const next = new Set(activeDisabledAreaKeys(flags));
  if (disabled) next.add(key);
  else next.delete(key);
  // Write the canonical list; also clear the legacy booleans so they can't
  // resurrect an area the admin just re-enabled.
  await persist(
    { disabledAreas: [...next], disableGenesis: false, disableExecution: false },
    user.id
  );
}

export default async function EmergencyControlsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const { error: actionError } = await searchParams;
  const status = await getCurrentStatus();

  const anyActive = status.maintenanceMode || status.disabledAreas.size > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Emergency Controls</h1>
        <p className="text-gray-600">Kill switches and emergency stops</p>
      </div>

      {actionError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold">Couldn&apos;t update maintenance settings</p>
            <p className="mt-1">{actionError}</p>
          </div>
        </div>
      )}

      {/* Emergency Banner */}
      {anyActive && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Emergency Mode Active
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc pl-5 space-y-1">
                  {status.maintenanceMode && (
                    <li>Full maintenance mode - entire app blocked for non-admins</li>
                  )}
                  {MAINTENANCE_AREAS.filter((a) => status.disabledAreas.has(a.key)).map((a) => (
                    <li key={a.key}>{a.label} disabled</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Emergency Stop - Big Red Button */}
      <div className="bg-white rounded-lg shadow-sm border-2 border-red-200 overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
            <Power className="w-5 h-5" />
            EMERGENCY STOP
          </h2>
        </div>
        <div className="p-6">
          <p className="text-gray-700 mb-4">
            Immediately stops all non-essential services. Use this during:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-600 mb-6 space-y-1">
            <li>Security breaches</li>
            <li>Data corruption incidents</li>
            <li>Runaway costs</li>
            <li>Cascading failures</li>
          </ul>
          
          <div className="flex gap-4">
            <form action={applyFlag.bind(null, { maintenanceMode: true })}>
              <button
                type="submit"
                disabled={status.maintenanceMode}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  status.maintenanceMode
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                <Power className="w-5 h-5" />
                {status.maintenanceMode ? "Already Active" : "ACTIVATE EMERGENCY STOP"}
              </button>
            </form>
            
            {status.maintenanceMode && (
              <form action={applyFlag.bind(null, { maintenanceMode: false })}>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
                >
                  <Shield className="w-5 h-5" />
                  RESUME NORMAL OPERATIONS
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      
      {/* Scoped maintenance — disable individual parts of the app */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Partial maintenance</h2>
          <p className="text-sm text-gray-500">
            Disable specific areas while the rest of the app keeps running. Admins can still use disabled areas.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100">
          {MAINTENANCE_AREAS.map((area) => {
            const disabled = status.disabledAreas.has(area.key);
            return (
              <div key={area.key} className="bg-white p-6">
                <div className="flex items-start justify-between mb-2 gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{area.label}</h3>
                  <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    disabled ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                  }`}>
                    {disabled ? "DISABLED" : "ENABLED"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">{area.description}</p>
                <form action={toggleArea.bind(null, area.key, !disabled)}>
                  <button
                    type="submit"
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      disabled
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-red-100 text-red-700 hover:bg-red-200"
                    }`}
                  >
                    {disabled ? `Enable ${area.label}` : `Disable ${area.label}`}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Manual Overrides */}
      <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Manual Override Instructions
        </h3>
        <div className="text-sm text-yellow-800 space-y-2">
          <p>
            The toggles above write to the database and take effect within ~10s — no
            redeploy needed. Admins (ADMIN_EMAILS, or a founder/dev role) can still
            browse the app while maintenance mode is on to verify the fix.
          </p>
          <p>
            Break-glass fallback only — if the database is unreachable, these Vercel
            env vars force a flag on (they require a redeploy to change):
          </p>
          <pre className="bg-yellow-100 p-3 rounded mt-2 overflow-x-auto">
{`EMERGENCY_MAINTENANCE_MODE=true
DISABLE_GENESIS_GENERATION=true
DISABLE_WORKFLOW_EXECUTION=true`}
          </pre>
        </div>
      </div>
    </div>
  );
}
