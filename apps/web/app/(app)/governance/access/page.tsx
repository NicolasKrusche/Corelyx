import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound, Users } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { EmptyState, PanelSection, Pill, statusClass } from "../_components/ui";

export const metadata = {
  title: "Access & Credentials — Governance & Compliance",
};

const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  owner: "Owner — full control",
  admin: "Admin — manage settings and members",
  member: "Member — build and run workflows",
  viewer: "Viewer — read-only",
};

const PROGRAM_ROLE_LABELS: Record<string, string> = {
  editor: "can edit",
  runner: "can run",
  viewer: "can view",
};

export default async function GovernanceAccessPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");
  const workspaceId = activeWorkspace.workspaceId;

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };

  const [
    { data: memberRows },
    { data: programRows },
    { data: connectionRows },
    { data: apiKeyRows },
  ] = await Promise.all([
    db
      .from("workspace_memberships")
      .select("user_id, role, created_at")
      .eq("workspace_id", workspaceId),
    db
      .from("programs")
      .select("id, name, user_id, visibility, is_active")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
    db
      .from("connections")
      .select("id, name, provider, auth_type, is_valid, last_validated_at")
      .eq("workspace_id", workspaceId),
    db
      .from("api_keys")
      .select("id, name, provider, is_valid")
      .eq("workspace_id", workspaceId),
  ]);

  const members = (memberRows ?? []) as Array<{ user_id: string; role: string; created_at: string }>;
  const programs = (programRows ?? []) as Array<{
    id: string;
    name: string;
    user_id: string;
    visibility: string | null;
    is_active: boolean;
  }>;
  const connections = (connectionRows ?? []) as Array<{
    id: string;
    name: string;
    provider: string;
    auth_type: string;
    is_valid: boolean | null;
    last_validated_at: string | null;
  }>;
  const apiKeys = (apiKeyRows ?? []) as Array<{
    id: string;
    name: string;
    provider: string;
    is_valid: boolean | null;
  }>;

  // Per-program links: memberships and connections.
  const programIds = programs.map((p) => p.id);
  let programMemberships: Array<{ program_id: string; user_id: string; role: string }> = [];
  let programConnections: Array<{ program_id: string; connection_id: string }> = [];
  if (programIds.length > 0) {
    const [{ data: pmRows }, { data: pcRows }] = await Promise.all([
      db.from("program_memberships").select("program_id, user_id, role").in("program_id", programIds),
      db.from("program_connections").select("program_id, connection_id").in("program_id", programIds),
    ]);
    programMemberships = (pmRows ?? []) as typeof programMemberships;
    programConnections = (pcRows ?? []) as typeof programConnections;
  }

  // Display names for everyone referenced.
  const userIds = [
    ...new Set([
      ...members.map((m) => m.user_id),
      ...programs.map((p) => p.user_id),
      ...programMemberships.map((m) => m.user_id),
    ]),
  ];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      nameById.set(p.id, p.display_name ?? "Unnamed user");
    }
  }
  const displayName = (id: string) => nameById.get(id) ?? "Unnamed user";

  const connectionById = new Map(connections.map((c) => [c.id, c]));
  const membershipsByProgram = new Map<string, Array<{ user_id: string; role: string }>>();
  for (const m of programMemberships) {
    const list = membershipsByProgram.get(m.program_id) ?? [];
    list.push(m);
    membershipsByProgram.set(m.program_id, list);
  }
  const connectionsByProgram = new Map<string, string[]>();
  const linkedConnectionIds = new Set<string>();
  for (const pc of programConnections) {
    const list = connectionsByProgram.get(pc.program_id) ?? [];
    list.push(pc.connection_id);
    connectionsByProgram.set(pc.program_id, list);
    linkedConnectionIds.add(pc.connection_id);
  }

  // Access-control warnings.
  const invalidConnections = connections.filter((c) => c.is_valid === false);
  const unusedConnections = connections.filter((c) => !linkedConnectionIds.has(c.id));
  const invalidApiKeys = apiKeys.filter((k) => k.is_valid === false);

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Access &amp; credentials</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Who can touch each workflow, which connected accounts and keys they use, and where
          the boundaries are. Credentials are always stored server-side and never shown here.
        </p>
      </section>

      {/* ── Warnings ──────────────────────────────────────────────────────── */}
      {(invalidConnections.length > 0 || invalidApiKeys.length > 0) && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              {invalidConnections.length > 0 && (
                <p>
                  {invalidConnections.length} connected account{invalidConnections.length === 1 ? "" : "s"} need
                  {invalidConnections.length === 1 ? "s" : ""} reconnection:{" "}
                  {invalidConnections.map((c) => c.name).join(", ")}. Workflows using them will fail until fixed.{" "}
                  <Link href="/connections" className="font-semibold underline underline-offset-2">
                    Fix in Connections
                  </Link>
                </p>
              )}
              {invalidApiKeys.length > 0 && (
                <p className="mt-1">
                  {invalidApiKeys.length} model API key{invalidApiKeys.length === 1 ? " is" : "s are"} marked invalid:{" "}
                  {invalidApiKeys.map((k) => k.name).join(", ")}.{" "}
                  <Link href="/api-keys" className="font-semibold underline underline-offset-2">
                    Fix in API Keys
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Workspace members ─────────────────────────────────────────────── */}
      <PanelSection
        title="Who has access to this workspace"
        description="Workspace roles set the outer permission boundary. Workflow-level sharing can only narrow access, never widen it."
        actions={
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <Users className="h-3.5 w-3.5" />
            Manage members
          </Link>
        }
      >
        {members.length === 0 ? (
          <EmptyState>No members found for this workspace.</EmptyState>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
              >
                <p className="min-w-0 truncate text-sm font-medium">{displayName(m.user_id)}</p>
                <Pill className={statusClass(m.role === "owner" || m.role === "admin" ? "review" : "active")}>
                  {WORKSPACE_ROLE_LABELS[m.role] ?? m.role}
                </Pill>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      {/* ── Per-workflow access and credentials ───────────────────────────── */}
      <PanelSection
        title="Access and credentials per workflow"
        description="Connected accounts are linked to individual workflows. Model API keys are shared across the workspace."
      >
        {programs.length === 0 ? (
          <EmptyState>No workflows yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Workflow</th>
                  <th className="px-3 py-2 font-semibold">Who can access it</th>
                  <th className="px-3 py-2 font-semibold">Connected accounts</th>
                  <th className="px-3 py-2 font-semibold">Credential scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {programs.map((program) => {
                  const shares = membershipsByProgram.get(program.id) ?? [];
                  const connIds = connectionsByProgram.get(program.id) ?? [];
                  const conns = connIds
                    .map((id) => connectionById.get(id))
                    .filter((c): c is NonNullable<typeof c> => Boolean(c));
                  const restricted = program.visibility === "restricted";
                  return (
                    <tr key={program.id} className="align-top">
                      <td className="px-3 py-3">
                        <Link
                          href={`/programs/${program.id}`}
                          className="font-medium transition-colors hover:text-primary"
                        >
                          {program.name}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Owner: {displayName(program.user_id)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Pill className={statusClass(restricted ? "review" : "active")}>
                          {restricted ? "Restricted — invited people only" : "Everyone in the workspace"}
                        </Pill>
                        {shares.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                            {shares.map((s) => (
                              <li key={s.user_id}>
                                {displayName(s.user_id)} ({PROGRAM_ROLE_LABELS[s.role] ?? s.role})
                              </li>
                            ))}
                          </ul>
                        )}
                        {restricted && shares.length === 0 && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Only the owner and workspace admins.
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {conns.length === 0 ? (
                          <span className="text-muted-foreground">None linked</span>
                        ) : (
                          <ul className="space-y-1">
                            {conns.map((c) => (
                              <li key={c.id} className="flex items-center gap-1.5">
                                <span>{c.name}</span>
                                <span className="text-muted-foreground">({c.provider})</span>
                                {c.is_valid === false && (
                                  <Pill className={statusClass("invalid")}>needs reconnection</Pill>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {conns.length > 0
                          ? "Linked to this workflow only"
                          : "Uses workspace-wide model keys only"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelSection>

      {/* ── Credential inventory ──────────────────────────────────────────── */}
      <PanelSection
        title="Credential inventory"
        description="Every credential this workspace can use, and how widely it is shared. Secret values stay in the encrypted vault and are never displayed."
        actions={
          <div className="flex gap-2">
            <Link
              href="/connections"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Connections
            </Link>
            <Link
              href="/api-keys"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
            >
              <KeyRound className="h-3.5 w-3.5" />
              API keys
            </Link>
          </div>
        }
      >
        {connections.length === 0 && apiKeys.length === 0 ? (
          <EmptyState>No credentials yet. Add a connection or an API key to get started.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Credential</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Scope</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {connections.map((c) => {
                  const usedBy = programConnections.filter((pc) => pc.connection_id === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-3 font-medium">
                        {c.name}
                        <span className="ml-1.5 text-xs text-muted-foreground">({c.provider})</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        Connected account ({c.auth_type === "oauth" ? "OAuth" : "API key"})
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {usedBy > 0 ? (
                          `Linked to ${usedBy} workflow${usedBy === 1 ? "" : "s"}`
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Not used by any workflow
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Pill className={statusClass(c.is_valid === false ? "invalid" : "valid")}>
                          {c.is_valid === false ? "Needs reconnection" : "Working"}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-3 py-3 font-medium">
                      {k.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">({k.provider})</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">Model API key</td>
                    <td className="px-3 py-3 text-xs">Workspace-wide (any workflow may use it)</td>
                    <td className="px-3 py-3">
                      <Pill className={statusClass(k.is_valid === false ? "invalid" : "valid")}>
                        {k.is_valid === false ? "Invalid" : "Working"}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unusedConnections.length > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Tip: {unusedConnections.length} connected account{unusedConnections.length === 1 ? " is" : "s are"} not
            linked to any workflow. Removing unused credentials reduces your access-control surface.
          </p>
        )}
      </PanelSection>
    </div>
  );
}
