"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Crown, Settings, Shield, Upload, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_ROLE_LABELS,
  canAssignWorkspaceRole,
  canManageWorkspace,
  type WorkspaceRole,
} from "@/lib/workspace-types";

type Workspace = {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  default_program_visibility: "workspace" | "restricted";
  members_can_create_programs: boolean;
  allow_external_agents: boolean;
  agent_min_role: "admin" | "member" | "viewer";
  compliance_mode: "standard" | "eu_only";
  execution_log_retention_days: number;
  prompt_retention_days: number;
  output_retention_days: number;
  approval_record_retention_days: number;
  secret_rotation_reminder_days: number;
  store_full_prompts: boolean;
  store_full_outputs: boolean;
  data_region: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  role: WorkspaceRole;
  member_count: number;
};

type Member = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Invitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  created_at: string;
};

type MembersResponse = {
  actor_role: WorkspaceRole;
  members: Member[];
  invitations: Invitation[];
};

const ROLE_OPTIONS: WorkspaceRole[] = ["owner", "admin", "member", "viewer"];
const INVITE_ROLE_OPTIONS: Exclude<WorkspaceRole, "owner">[] = ["admin", "member", "viewer"];

function roleClass(role: WorkspaceRole) {
  switch (role) {
    case "owner":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "admin":
      return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "member":
      return "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function initials(member: Member) {
  const label = member.display_name || member.email || "Member";
  return label.slice(0, 1).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function WorkspacesClient() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [membersState, setMembersState] = useState<MembersResponse | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<WorkspaceRole, "owner">>("member");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsDefaultVisibility, setSettingsDefaultVisibility] = useState<"workspace" | "restricted">("workspace");
  const [settingsMembersCanCreate, setSettingsMembersCanCreate] = useState(true);
  const [settingsAllowExternalAgents, setSettingsAllowExternalAgents] = useState(false);
  const [settingsAgentMinRole, setSettingsAgentMinRole] = useState<"admin" | "member" | "viewer">("admin");
  const [settingsComplianceMode, setSettingsComplianceMode] = useState<"standard" | "eu_only">("standard");
  const [executionLogRetentionDays, setExecutionLogRetentionDays] = useState(90);
  const [promptRetentionDays, setPromptRetentionDays] = useState(0);
  const [outputRetentionDays, setOutputRetentionDays] = useState(0);
  const [approvalRetentionDays, setApprovalRetentionDays] = useState(365);
  const [secretRotationDays, setSecretRotationDays] = useState(90);
  const [storeFullPrompts, setStoreFullPrompts] = useState(false);
  const [storeFullOutputs, setStoreFullOutputs] = useState(false);
  const [dataRegion, setDataRegion] = useState("eu-central-1");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const actorRole = membersState?.actor_role ?? selectedWorkspace?.role ?? "viewer";
  const canManage = canManageWorkspace(actorRole);

  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    const res = await fetch("/api/workspaces", { cache: "no-store" });
    const body = await res.json().catch(() => null) as {
      workspaces?: Workspace[];
      active_workspace_id?: string | null;
      error?: string;
    } | null;

    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not load workspaces." });
      setLoadingWorkspaces(false);
      return;
    }

    const nextWorkspaces = body?.workspaces ?? [];
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId(body?.active_workspace_id ?? null);
    setSelectedWorkspaceId((current) =>
      current && nextWorkspaces.some((workspace) => workspace.id === current)
        ? current
        : body?.active_workspace_id ?? nextWorkspaces[0]?.id ?? null
    );
    setLoadingWorkspaces(false);
  }, []);

  const loadMembers = useCallback(async (workspaceId: string) => {
    setLoadingMembers(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, { cache: "no-store" });
    const body = await res.json().catch(() => null) as MembersResponse & { error?: string } | null;

    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not load workspace members." });
      setMembersState(null);
      setLoadingMembers(false);
      return;
    }

    setMembersState({
      actor_role: body!.actor_role,
      members: body!.members ?? [],
      invitations: body!.invitations ?? [],
    });
    setLoadingMembers(false);
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspace) {
      setMembersState(null);
      setRenameValue("");
      return;
    }
    setRenameValue(selectedWorkspace.name);
    setSettingsDescription(selectedWorkspace.description ?? "");
    setSettingsDefaultVisibility(selectedWorkspace.default_program_visibility ?? "workspace");
    setSettingsMembersCanCreate(selectedWorkspace.members_can_create_programs ?? true);
    setSettingsAllowExternalAgents(selectedWorkspace.allow_external_agents ?? false);
    setSettingsAgentMinRole(selectedWorkspace.agent_min_role ?? "admin");
    setSettingsComplianceMode(selectedWorkspace.compliance_mode ?? "standard");
    setExecutionLogRetentionDays(selectedWorkspace.execution_log_retention_days ?? 90);
    setPromptRetentionDays(selectedWorkspace.prompt_retention_days ?? 0);
    setOutputRetentionDays(selectedWorkspace.output_retention_days ?? 0);
    setApprovalRetentionDays(selectedWorkspace.approval_record_retention_days ?? 365);
    setSecretRotationDays(selectedWorkspace.secret_rotation_reminder_days ?? 90);
    setStoreFullPrompts(selectedWorkspace.store_full_prompts ?? false);
    setStoreFullOutputs(selectedWorkspace.store_full_outputs ?? false);
    setDataRegion(selectedWorkspace.data_region ?? "eu-central-1");
    void loadMembers(selectedWorkspace.id);
  }, [selectedWorkspace, loadMembers]);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy("create");

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: workspaceName }),
    });
    const body = await res.json().catch(() => null) as { workspace?: Workspace; error?: string } | null;

    if (!res.ok || !body?.workspace) {
      setMessage({ type: "error", text: body?.error ?? "Could not create workspace." });
      setBusy(null);
      return;
    }

    setWorkspaceName("");
    setMessage({ type: "success", text: "Workspace created." });
    await loadWorkspaces();
    setSelectedWorkspaceId(body.workspace.id);
    setBusy(null);
  }

  async function switchWorkspace(workspaceId: string) {
    setBusy(`switch:${workspaceId}`);
    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch", workspace_id: workspaceId }),
    });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not switch workspace." });
    } else {
      setActiveWorkspaceId(workspaceId);
      setMessage({ type: "success", text: "Active workspace updated." });
    }
    setBusy(null);
  }

  async function renameWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace) return;
    setBusy("rename");

    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rename",
        workspace_id: selectedWorkspace.id,
        name: renameValue,
      }),
    });
    const body = await res.json().catch(() => null) as { workspace?: Workspace; error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not rename workspace." });
    } else {
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === selectedWorkspace.id
            ? { ...workspace, name: body?.workspace?.name ?? renameValue }
            : workspace
        )
      );
      setMessage({ type: "success", text: "Workspace renamed." });
    }
    setBusy(null);
  }

  async function updateSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace) return;
    setBusy("settings");

    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_settings",
        workspace_id: selectedWorkspace.id,
        description: settingsDescription.trim() || null,
        default_program_visibility: settingsDefaultVisibility,
        members_can_create_programs: settingsMembersCanCreate,
        allow_external_agents: settingsAllowExternalAgents,
        agent_min_role: settingsAgentMinRole,
        compliance_mode: settingsComplianceMode,
        execution_log_retention_days: executionLogRetentionDays,
        prompt_retention_days: promptRetentionDays,
        output_retention_days: outputRetentionDays,
        approval_record_retention_days: approvalRetentionDays,
        secret_rotation_reminder_days: secretRotationDays,
        store_full_prompts: storeFullPrompts,
        store_full_outputs: storeFullOutputs,
        data_region: dataRegion.trim() || "eu-central-1",
      }),
    });
    const body = await res.json().catch(() => null) as { workspace?: Workspace; error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not save settings." });
    } else {
      setWorkspaces((current) =>
        current.map((ws) =>
          ws.id === selectedWorkspace.id
            ? { ...ws, ...(body?.workspace ?? {}) }
            : ws
        )
      );
      setMessage({ type: "success", text: "Settings saved." });
    }
    setBusy(null);
  }

  async function uploadLogo(file: File) {
    if (!selectedWorkspace) return;
    setBusy("logo");
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/logo`, { method: "POST", body: fd });
    const body = await res.json().catch(() => null) as { logo_url?: string; error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not upload logo." });
    } else {
      setWorkspaces((current) =>
        current.map((ws) =>
          ws.id === selectedWorkspace.id ? { ...ws, logo_url: body?.logo_url ?? ws.logo_url } : ws
        )
      );
      setMessage({ type: "success", text: "Logo updated." });
    }
    setBusy(null);
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace) return;
    setBusy("invite");

    const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const body = await res.json().catch(() => null) as {
      member?: Member;
      invitation?: Invitation;
      error?: string;
    } | null;

    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not add this person." });
      setBusy(null);
      return;
    }

    setInviteEmail("");
    setInviteRole("member");
    setMessage({
      type: "success",
      text: body?.member ? "Member added." : "Invitation saved for this email.",
    });
    await loadMembers(selectedWorkspace.id);
    await loadWorkspaces();
    setBusy(null);
  }

  async function updateRole(member: Member, role: WorkspaceRole) {
    if (!selectedWorkspace || member.role === role) return;
    setBusy(`role:${member.user_id}`);

    const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: member.user_id, role }),
    });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not update role." });
    } else {
      setMessage({ type: "success", text: "Role updated." });
      await loadMembers(selectedWorkspace.id);
    }
    setBusy(null);
  }

  async function removeMember(member: Member) {
    if (!selectedWorkspace) return;
    setBusy(`remove:${member.user_id}`);

    const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members?user_id=${encodeURIComponent(member.user_id)}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not remove member." });
    } else {
      setMessage({ type: "success", text: "Member removed." });
      await loadMembers(selectedWorkspace.id);
      await loadWorkspaces();
    }
    setBusy(null);
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!selectedWorkspace) return;
    setBusy(`invite:${invitation.id}`);

    const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members?invitation_id=${encodeURIComponent(invitation.id)}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Could not revoke invitation." });
    } else {
      setMessage({ type: "success", text: "Invitation revoked." });
      await loadMembers(selectedWorkspace.id);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Workspace</p>
          <h1 className="text-3xl font-black tracking-tight">Workspaces & People</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Create separate workspaces and assign each person a rank: Owner, Admin, Member, or Viewer.
          </p>
        </div>

        <form onSubmit={createWorkspace} className="flex w-full gap-2 sm:max-w-md">
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="New workspace name"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy === "create" || workspaceName.trim().length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "create" ? "Creating..." : "Create"}
          </button>
        </form>
      </div>

      {message && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            message.type === "success"
              ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
          )}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {loadingWorkspaces && workspaces.length === 0 ? (
            <div className="rounded-xl border glass-card p-5 text-sm text-muted-foreground">
              Loading workspaces...
            </div>
          ) : workspaces.length === 0 ? (
            <div className="rounded-xl border border-dashed glass-card p-5 text-sm text-muted-foreground">
              No workspaces yet.
            </div>
          ) : (
            workspaces.map((workspace) => {
              const selected = selectedWorkspace?.id === workspace.id;
              const active = activeWorkspaceId === workspace.id;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                  className={cn(
                    "w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent",
                    selected ? "border-primary/50" : "border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {workspace.logo_url ? (
                      // Workspace logos are user-uploaded storage URLs; Next Image
                      // optimization is not configured for arbitrary tenant domains.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={workspace.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{workspace.name}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {workspace.member_count} {workspace.member_count === 1 ? "person" : "people"}
                      </span>
                    </span>
                  </div>
                  <span className={cn("mt-3 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", roleClass(workspace.role))}>
                    {WORKSPACE_ROLE_LABELS[workspace.role]}
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <main className="min-w-0 space-y-5">
          {!selectedWorkspace ? (
            <div className="rounded-xl border glass-card p-6 text-sm text-muted-foreground">
              Select or create a workspace to manage people.
            </div>
          ) : (
            <>
              <section className="rounded-xl border glass-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold tracking-tight">{selectedWorkspace.name}</h2>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", roleClass(actorRole))}>
                        {WORKSPACE_ROLE_LABELS[actorRole]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedWorkspace.description
                        ? selectedWorkspace.description
                        : `Created ${formatDate(selectedWorkspace.created_at)}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => switchWorkspace(selectedWorkspace.id)}
                    disabled={activeWorkspaceId === selectedWorkspace.id || busy === `switch:${selectedWorkspace.id}`}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {activeWorkspaceId === selectedWorkspace.id ? "Active workspace" : "Set active"}
                  </button>
                </div>

                {canManage && (
                  <form onSubmit={renameWorkspace} className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={busy === "rename" || renameValue.trim().length === 0}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                    >
                      {busy === "rename" ? "Saving..." : "Rename"}
                    </button>
                  </form>
                )}
              </section>

              {canManage && (
                <section className="rounded-xl border glass-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Workspace settings</h3>
                  </div>

                  <div className="mb-5 flex items-center gap-4">
                    <div className="relative shrink-0">
                      {selectedWorkspace.logo_url ? (
                        // Workspace logos are user-uploaded storage URLs; Next Image
                        // optimization is not configured for arbitrary tenant domains.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedWorkspace.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ) : (
                        <span className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Building2 className="h-8 w-8" />
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy === "logo"}
                        onClick={() => logoInputRef.current?.click()}
                        className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent disabled:opacity-50"
                        title="Upload logo"
                      >
                        <Upload className="h-3 w-3" />
                      </button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadLogo(file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPEG, WebP or GIF · max 2 MB
                    </p>
                  </div>

                  <form onSubmit={updateSettings} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
                      <textarea
                        value={settingsDescription}
                        onChange={(e) => setSettingsDescription(e.target.value)}
                        maxLength={300}
                        rows={2}
                        placeholder="Short description of this workspace…"
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Default program visibility</label>
                        <select
                          value={settingsDefaultVisibility}
                          onChange={(e) => setSettingsDefaultVisibility(e.target.value as "workspace" | "restricted")}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                          <option value="workspace">Workspace (all members)</option>
                          <option value="restricted">Restricted (explicit roles only)</option>
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">Applied to new programs by default.</p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Program creation</label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                          <input
                            type="checkbox"
                            checked={settingsMembersCanCreate}
                            onChange={(e) => setSettingsMembersCanCreate(e.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className="text-sm">Members can create programs</span>
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">When off, only owners and admins can create programs.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">External agents</label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                          <input
                            type="checkbox"
                            checked={settingsAllowExternalAgents}
                            onChange={(e) => setSettingsAllowExternalAgents(e.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className="text-sm">Allow other members&apos; agents to act here</span>
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          When off, only you (the owner) can run agents that act on this workspace.
                        </p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Minimum role for agents</label>
                        <select
                          value={settingsAgentMinRole}
                          onChange={(e) => setSettingsAgentMinRole(e.target.value as "admin" | "member" | "viewer")}
                          disabled={!settingsAllowExternalAgents}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                        >
                          <option value="admin">Admins only</option>
                          <option value="member">Members and above</option>
                          <option value="viewer">Any member (including viewers)</option>
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          The lowest role a member needs for their agents to act on this workspace. The owner is always allowed.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Compliance mode</label>
                        <select
                          value={settingsComplianceMode}
                          onChange={(e) => setSettingsComplianceMode(e.target.value as "standard" | "eu_only")}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                          <option value="standard">Standard</option>
                          <option value="eu_only">EU-only</option>
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          EU-only mode blocks providers without verified EU residency, DPA, SCC, and transfer-basis evidence.
                        </p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data region label</label>
                        <input
                          value={dataRegion}
                          onChange={(e) => setDataRegion(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          placeholder="eu-central-1"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Shown in workflow exports and audit records.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        ["Execution log retention", executionLogRetentionDays, setExecutionLogRetentionDays],
                        ["Prompt retention", promptRetentionDays, setPromptRetentionDays],
                        ["Output retention", outputRetentionDays, setOutputRetentionDays],
                        ["Approval retention", approvalRetentionDays, setApprovalRetentionDays],
                        ["Secret rotation reminder", secretRotationDays, setSecretRotationDays],
                      ].map(([label, value, setter]) => (
                        <div key={label as string}>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label as string} days</label>
                          <input
                            type="number"
                            min={label === "Prompt retention" || label === "Output retention" ? 0 : 1}
                            value={value as number}
                            onChange={(e) => (setter as (next: number) => void)(Number.parseInt(e.target.value || "0", 10))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3">
                        <input
                          type="checkbox"
                          checked={storeFullPrompts}
                          onChange={(e) => setStoreFullPrompts(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <span>
                          <span className="block text-sm">Allow full prompt logging</span>
                          <span className="mt-1 block text-xs text-muted-foreground">Off by default for sensitive workflows; hashes and metadata remain available.</span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3">
                        <input
                          type="checkbox"
                          checked={storeFullOutputs}
                          onChange={(e) => setStoreFullOutputs(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <span>
                          <span className="block text-sm">Allow full output logging</span>
                          <span className="mt-1 block text-xs text-muted-foreground">Keep disabled unless a lawful operational need is documented.</span>
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={busy === "settings"}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === "settings" ? "Saving..." : "Save settings"}
                    </button>
                  </form>
                </section>
              )}

              {canManage && (
                <section className="rounded-xl border glass-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Add people</h3>
                  </div>
                  <form onSubmit={addPerson} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Exclude<WorkspaceRole, "owner">)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      {INVITE_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{WORKSPACE_ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={busy === "invite"}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === "invite" ? "Adding..." : "Add"}
                    </button>
                  </form>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Existing users are added immediately. New emails are kept as pending invitations.
                  </p>
                </section>
              )}

              <section className="rounded-xl border glass-card">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">People</h3>
                </div>

                {loadingMembers ? (
                  <p className="p-5 text-sm text-muted-foreground">Loading people...</p>
                ) : (
                  <div className="divide-y divide-border">
                    {(membersState?.members ?? []).map((member) => (
                      <div key={member.user_id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-bold"
                            style={member.avatar_url ? { backgroundImage: `url(${member.avatar_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                          >
                            {!member.avatar_url && initials(member)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {member.display_name || member.email || member.user_id}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{member.email ?? member.user_id}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          {canManage ? (
                            <select
                              value={member.role}
                              disabled={
                                busy === `role:${member.user_id}` ||
                                !canAssignWorkspaceRole(actorRole, member.role)
                              }
                              onChange={(e) => updateRole(member, e.target.value as WorkspaceRole)}
                              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option
                                  key={role}
                                  value={role}
                                  disabled={!canAssignWorkspaceRole(actorRole, role)}
                                >
                                  {WORKSPACE_ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", roleClass(member.role))}>
                              {WORKSPACE_ROLE_LABELS[member.role]}
                            </span>
                          )}

                          {member.role === "owner" ? <Crown className="h-4 w-4 text-amber-500" /> : <Shield className="h-4 w-4 text-muted-foreground" />}

                          {canManage && (
                            <button
                              type="button"
                              onClick={() => removeMember(member)}
                              disabled={busy === `remove:${member.user_id}`}
                              className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {(membersState?.invitations?.length ?? 0) > 0 && (
                <section className="rounded-xl border glass-card">
                  <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Pending invitations</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {membersState!.invitations.map((invitation) => (
                      <div key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited as {WORKSPACE_ROLE_LABELS[invitation.role]} on {formatDate(invitation.created_at)}
                          </p>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => revokeInvitation(invitation)}
                            disabled={busy === `invite:${invitation.id}`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
