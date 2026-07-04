import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import {
  applySecurityLock,
  releaseSecurityLock,
} from "@/lib/security/sentinel";
import { SENTINEL_RULES, type SecurityScopeType } from "@/lib/security/sentinel-rules";
import {
  AlertTriangle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from "lucide-react";

type SecurityEventRow = {
  id: string;
  created_at: string;
  event: string;
  severity: "info" | "warning" | "critical";
  scope_type: string;
  scope_id: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  action: string | null;
};

type SecurityLockRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  reason: string;
  locked_by: string;
  created_at: string;
  expires_at: string | null;
};

const SCOPE_TYPES: SecurityScopeType[] = ["user", "program", "webhook_token", "route", "ip"];

async function getSecurityData() {
  // New sentinel tables aren't in the generated DB types yet — untyped view.
  const db = createServiceClient() as unknown as { from(t: string): any };

  const [eventsRes, locksRes] = await Promise.all([
    db
      .from("security_events")
      .select("id, created_at, event, severity, scope_type, scope_id, user_id, details, action")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("security_locks")
      .select("id, scope_type, scope_id, reason, locked_by, created_at, expires_at")
      .is("released_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const events = (eventsRes.data ?? []) as SecurityEventRow[];
  const now = Date.now();
  const locks = ((locksRes.data ?? []) as SecurityLockRow[]).filter(
    (l) => !l.expires_at || new Date(l.expires_at).getTime() > now
  );
  return { events, locks };
}

async function assertAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasTechnicalAccess(user.id, user.email))) {
    throw new Error("Unauthorized");
  }
  return user;
}

function backToPage(error?: string) {
  revalidatePath("/admin/security");
  redirect(error ? `/admin/security?error=${encodeURIComponent(error)}` : "/admin/security");
}

async function releaseLockAction(formData: FormData) {
  "use server";
  const user = await assertAdmin();
  const scopeType = String(formData.get("scope_type") ?? "") as SecurityScopeType;
  const scopeId = String(formData.get("scope_id") ?? "");
  if (!SCOPE_TYPES.includes(scopeType) || !scopeId) backToPage("Invalid lock reference.");
  const released = await releaseSecurityLock(scopeType, scopeId, user.id);
  backToPage(released ? undefined : "Lock could not be released — it may already be gone.");
}

async function applyLockAction(formData: FormData) {
  "use server";
  const user = await assertAdmin();
  const scopeType = String(formData.get("scope_type") ?? "") as SecurityScopeType;
  const scopeId = String(formData.get("scope_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const ttlRaw = Number(formData.get("ttl_minutes"));
  if (!SCOPE_TYPES.includes(scopeType) || !scopeId) {
    backToPage("Choose a scope type and enter a scope id.");
  }
  const ttlMinutes = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.min(ttlRaw, 7 * 24 * 60) : null;
  const applied = await applySecurityLock({
    scopeType,
    scopeId,
    reason: reason || "Manually locked by admin",
    lockedBy: user.id,
    ttlSeconds: ttlMinutes === null ? null : ttlMinutes * 60,
  });
  backToPage(applied ? undefined : "Lock could not be applied.");
}

function severityBadge(severity: SecurityEventRow["severity"]) {
  const styles =
    severity === "critical"
      ? "bg-red-500/15 text-red-700 dark:text-red-300"
      : severity === "warning"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-foreground/80";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {severity}
    </span>
  );
}

function shortScope(scopeId: string): string {
  return scopeId.length > 20 ? `${scopeId.slice(0, 20)}…` : scopeId;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "until released";
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return "expiring";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m left`;
}

export default async function SecuritySentinelPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const { error: actionError } = await searchParams;
  const { events, locks } = await getSecurityData();

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const eventsToday = events.filter((e) => new Date(e.created_at).getTime() > dayAgo);
  const criticalToday = eventsToday.filter((e) => e.severity === "critical").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Security Sentinel</h1>
        <p className="text-muted-foreground">
          Anomaly events and scoped containment locks. Locks affect one token,
          program, or user — full maintenance mode lives under Emergency.
        </p>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-3 ${locks.length > 0 ? "bg-red-500/15" : "bg-green-500/15"}`}>
              {locks.length > 0 ? (
                <Lock className="h-6 w-6 text-red-600 dark:text-red-400" />
              ) : (
                <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Locks</p>
              <p className="text-2xl font-bold text-foreground">{locks.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-3 ${criticalToday > 0 ? "bg-red-500/15" : "bg-muted"}`}>
              <ShieldAlert className={`h-6 w-6 ${criticalToday > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Critical (24h)</p>
              <p className="text-2xl font-bold text-foreground">{criticalToday}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-500/15 p-3">
              <AlertTriangle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Events (24h)</p>
              <p className="text-2xl font-bold text-foreground">{eventsToday.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active locks */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Active Locks</h2>
        </div>
        {locks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <p>No active security locks</p>
            <p className="text-sm">Nothing is currently contained</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  {["Scope", "Scope ID", "Reason", "Locked By", "Expires", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {locks.map((lock) => (
                  <tr key={lock.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground">{lock.scope_type}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-muted-foreground" title={lock.scope_id}>
                      {shortScope(lock.scope_id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground/80">{lock.reason}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-muted-foreground">
                      {lock.locked_by === "sentinel" ? "sentinel (auto)" : shortScope(lock.locked_by)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">{formatExpiry(lock.expires_at)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <form action={releaseLockAction}>
                        <input type="hidden" name="scope_type" value={lock.scope_type} />
                        <input type="hidden" name="scope_id" value={lock.scope_id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Release
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual lock */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Apply a Manual Lock</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Contain a specific program, user, or webhook token while you investigate.
          Webhook tokens must be entered as their SHA-256 hash (shown in events).
        </p>
        <form action={applyLockAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <select
            name="scope_type"
            defaultValue="program"
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            {SCOPE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            name="scope_id"
            required
            placeholder="Scope id (program/user UUID, token hash…)"
            className="rounded-md border border-border px-3 py-2 font-mono text-sm lg:col-span-2"
          />
          <input
            name="ttl_minutes"
            type="number"
            min={1}
            placeholder="TTL minutes (blank = until released)"
            className="rounded-md border border-border px-3 py-2 text-sm"
          />
          <input
            name="reason"
            placeholder="Reason"
            className="rounded-md border border-border px-3 py-2 text-sm sm:col-span-2 lg:col-span-4"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <Lock className="h-4 w-4" />
            Lock
          </button>
        </form>
      </div>

      {/* Recent events */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Security Events</h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <p>No security events recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  {["Time", "Event", "Severity", "Scope", "Scope ID", "Details"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-foreground">{e.event}</td>
                    <td className="whitespace-nowrap px-6 py-4">{severityBadge(e.severity)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground/80">{e.scope_type}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-muted-foreground" title={e.scope_id}>
                      {shortScope(e.scope_id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {e.details ? JSON.stringify(e.details).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rules reference */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-6">
        <h3 className="mb-2 text-lg font-semibold text-blue-700 dark:text-blue-300">Automatic Rules</h3>
        <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
          {Object.entries(SENTINEL_RULES).map(([event, rule]) => (
            <p key={event}>
              <strong className="font-mono">{event}</strong>: over{" "}
              {Math.round(rule.windowSeconds / 60)}m —{" "}
              {rule.alertThreshold !== undefined && `alert at ${rule.alertThreshold}`}
              {rule.lockThreshold !== undefined
                ? `, auto-lock at ${rule.lockThreshold} for ${Math.round((rule.lockTtlSeconds ?? 0) / 60)}m`
                : ", never auto-locks"}
            </p>
          ))}
          <p className="pt-2">
            Locks are scoped containment, not shutdown. The full-app kill switch
            stays a human decision on the Emergency page.
          </p>
        </div>
      </div>
    </div>
  );
}
