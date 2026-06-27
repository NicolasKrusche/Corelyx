import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import { Building2, Inbox, AlertTriangle, XCircle, ShieldCheck, Bot } from "lucide-react";
import { AddTestFirm, RemoveFirmButton } from "./test-firms-admin";

export const metadata = { title: "Test Firms" };

// A "test firm" = a workspace an admin has explicitly registered in `test_firms`
// because the firm granted us access for testing. It is NEVER inferred from a
// connector — any regular user can connect Thunderbird/IMAP. This panel
// aggregates everything we want to watch during those engagements: inbox health,
// agent activity, run outcomes, and the critical-signal flags the safety net raised.

type Conn = {
  id: string;
  name: string | null;
  provider: string | null;
  workspace_id: string;
  is_valid: boolean | null;
  last_validated_at: string | null;
};
type Flag = {
  workspace_id: string;
  origin: string | null;
  subject: string | null;
  categories: string[] | null;
  created_at: string;
};

type Firm = {
  workspaceId: string;
  name: string;
  complianceMode: string;
  connections: Conn[];
  invalidConnections: number;
  agentCount: number;
  runCounts: { success: number; failed: number; active: number; other: number };
  lastActivity: string | null;
  flagsPending: number;
  flagsAuto: number;
  flagsAgent: number;
  latestFlag: Flag | null;
};

async function loadTestFirms(): Promise<{
  firms: Firm[];
  totals: { firms: number; inboxes: number; invalidInboxes: number; pendingFlags: number; failedRuns: number };
}> {
  const db = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  // Source of truth: the explicit admin-curated registry — NOT connector presence
  // (any regular user can connect Thunderbird/IMAP).
  const { data: firmRaw } = await db.from("test_firms").select("workspace_id, label, notes");
  const registry = (firmRaw ?? []) as Array<{ workspace_id: string; label: string | null; notes: string | null }>;
  const wsIds = registry.map((r) => r.workspace_id);
  const labelMap = new Map(registry.map((r) => [r.workspace_id, r.label]));

  const empty = { firms: [], totals: { firms: 0, inboxes: 0, invalidInboxes: 0, pendingFlags: 0, failedRuns: 0 } };
  if (wsIds.length === 0) return empty;

  // Connections for the registered workspaces (any provider) — inbox/app health.
  const { data: connRaw } = await db
    .from("connections")
    .select("id, name, provider, workspace_id, is_valid, last_validated_at")
    .in("workspace_id", wsIds)
    .order("created_at", { ascending: false });
  const conns = (connRaw ?? []) as Conn[];

  const [wsRes, progRes, flagRes] = await Promise.all([
    db.from("workspaces").select("id, name, compliance_mode").in("id", wsIds),
    db.from("programs").select("id, workspace_id, agent_state").eq("program_type", "agent").in("workspace_id", wsIds),
    // agent_flags may not be migrated yet → null → treated as none.
    db.from("agent_flags").select("workspace_id, origin, subject, categories, created_at, status").eq("status", "pending").in("workspace_id", wsIds).order("created_at", { ascending: false }),
  ]);

  const wsMap = new Map(
    ((wsRes.data ?? []) as Array<{ id: string; name: string | null; compliance_mode: string | null }>).map((w) => [
      w.id,
      { name: w.name ?? "Untitled workspace", compliance_mode: w.compliance_mode ?? "standard" },
    ])
  );
  const progs = (progRes.data ?? []) as Array<{ id: string; workspace_id: string; agent_state: string | null }>;
  const progWs = new Map(progs.map((p) => [p.id, p.workspace_id]));
  const flags = (flagRes.data ?? []) as Flag[];

  // Recent runs for those agents (one query, then bucket by workspace).
  const progIds = progs.map((p) => p.id);
  let runs: Array<{ program_id: string; status: string; created_at: string }> = [];
  if (progIds.length > 0) {
    const { data: runRaw } = await db
      .from("runs")
      .select("program_id, status, created_at")
      .in("program_id", progIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    runs = (runRaw ?? []) as typeof runs;
  }

  const firms: Firm[] = wsIds.map((wsId) => {
    const ws = wsMap.get(wsId);
    const wsConns = conns.filter((c) => c.workspace_id === wsId);
    const wsAgents = progs.filter((p) => p.workspace_id === wsId);
    const wsRuns = runs.filter((r) => progWs.get(r.program_id) === wsId);
    const wsFlags = flags.filter((f) => f.workspace_id === wsId);

    const runCounts = { success: 0, failed: 0, active: 0, other: 0 };
    let lastActivity: string | null = null;
    for (const r of wsRuns) {
      if (r.status === "success") runCounts.success++;
      else if (r.status === "failed") runCounts.failed++;
      else if (r.status === "running" || r.status === "pending") runCounts.active++;
      else runCounts.other++;
      if (!lastActivity || r.created_at > lastActivity) lastActivity = r.created_at;
    }

    return {
      workspaceId: wsId,
      name: labelMap.get(wsId) || ws?.name || "Untitled workspace",
      complianceMode: ws?.compliance_mode ?? "standard",
      connections: wsConns,
      invalidConnections: wsConns.filter((c) => c.is_valid === false).length,
      agentCount: wsAgents.length,
      runCounts,
      lastActivity,
      flagsPending: wsFlags.length,
      flagsAuto: wsFlags.filter((f) => f.origin === "auto").length,
      flagsAgent: wsFlags.filter((f) => f.origin === "agent").length,
      latestFlag: wsFlags[0] ?? null,
    };
  });

  // Firms with unresolved flags or broken inboxes float to the top.
  firms.sort((a, b) => b.flagsPending - a.flagsPending || b.invalidConnections - a.invalidConnections);

  return {
    firms,
    totals: {
      firms: firms.length,
      inboxes: conns.length,
      invalidInboxes: conns.filter((c) => c.is_valid === false).length,
      pendingFlags: flags.length,
      failedRuns: runs.filter((r) => r.status === "failed").length,
    },
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default async function TestFirmsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const { firms, totals } = await loadTestFirms();

  const stats = [
    { label: "Test firms", value: totals.firms, Icon: Building2, tone: "bg-blue-100 text-blue-600" },
    { label: "Connected inboxes", value: totals.inboxes, Icon: Inbox, tone: "bg-emerald-100 text-emerald-600" },
    { label: "Pending flags", value: totals.pendingFlags, Icon: AlertTriangle, tone: "bg-red-100 text-red-600" },
    { label: "Failed runs", value: totals.failedRuns, Icon: XCircle, tone: "bg-amber-100 text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test Firms</h1>
        <p className="text-gray-600">Firms you&apos;ve designated for testing — inbox health, agent activity, run outcomes, and safety flags.</p>
      </div>

      <AddTestFirm />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-3 ${s.tone}`}>
                <s.Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totals.invalidInboxes > 0 && (
        <div className="border-l-4 border-amber-400 bg-amber-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <p className="ml-3 text-sm text-amber-700">
              {totals.invalidInboxes} connected inbox{totals.invalidInboxes === 1 ? "" : "es"} {totals.invalidInboxes === 1 ? "is" : "are"} failing
              validation (expired/incorrect credentials) — agents can&apos;t read or send until reconnected.
            </p>
          </div>
        </div>
      )}

      {firms.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
          <Inbox className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <p className="font-medium text-gray-700">No test firms yet</p>
          <p className="text-sm">Add one above by workspace ID or the firm&apos;s account email. Connecting an inbox does not designate a firm.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {firms.map((f) => (
            <div key={f.workspaceId} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">{f.name}</h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.complianceMode === "eu_only" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {f.complianceMode === "eu_only" ? "EU-only" : "Standard"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {f.flagsPending > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {f.flagsPending} flag{f.flagsPending === 1 ? "" : "s"} pending
                      <span className="font-normal text-red-500"> ({f.flagsAuto} auto · {f.flagsAgent} agent)</span>
                    </span>
                  )}
                  <RemoveFirmButton workspaceId={f.workspaceId} name={f.name} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2 lg:grid-cols-4">
                {/* Inboxes */}
                <div className="bg-white px-6 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Inboxes</p>
                  <ul className="mt-1 space-y-1">
                    {f.connections.map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5 text-sm">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${c.is_valid === false ? "bg-red-500" : "bg-emerald-500"}`}
                          title={c.is_valid === false ? "Invalid" : "Valid"}
                        />
                        <span className="truncate text-gray-800">{c.name ?? "Inbox"}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Agents */}
                <div className="bg-white px-6 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Agents</p>
                  <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-gray-900">
                    <Bot className="h-5 w-5 text-gray-400" />
                    {f.agentCount}
                  </p>
                </div>

                {/* Runs */}
                <div className="bg-white px-6 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Runs</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm">
                    <span className="text-emerald-600">{f.runCounts.success} ok</span>
                    <span className="text-red-600">{f.runCounts.failed} failed</span>
                    <span className="text-blue-600">{f.runCounts.active} active</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Last: {fmtDate(f.lastActivity)}</p>
                </div>

                {/* Latest flag */}
                <div className="bg-white px-6 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Latest flag</p>
                  {f.latestFlag ? (
                    <div className="mt-1">
                      <p className="truncate text-sm text-gray-800">{f.latestFlag.subject ?? "Flagged message"}</p>
                      <p className="text-xs text-gray-400">
                        {(f.latestFlag.categories ?? []).join(", ").replace(/_/g, " ") || "—"} · {fmtDate(f.latestFlag.created_at)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">None</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
