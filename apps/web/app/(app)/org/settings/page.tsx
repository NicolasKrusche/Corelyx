"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Crown,
  Link2,
  Mail,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_ROLE_LABELS,
  canManageWorkspace,
  type WorkspaceRole,
} from "@/lib/workspace-types";

type Org = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  role: string;
  member_count: number;
  created_at: string;
  updated_at: string;
};

type Member = {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Invitation = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
};

type MembersResponse = {
  actor_role: string;
  members: Member[];
  invitations: Invitation[];
};

const ORG_ROLES = ["admin", "editor", "viewer"] as const;

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  editor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function OrgSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [actorRole, setActorRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const isManager = canManageWorkspace(actorRole as WorkspaceRole);
  const isOwner = actorRole === "owner";

  const loadOrg = useCallback(async () => {
    try {
      setLoading(true);
      // First get the user's orgs
      const orgsRes = await fetch("/api/orgs");
      if (!orgsRes.ok) throw new Error("Failed to load organizations");
      const orgsData = await orgsRes.json();

      if (!orgsData.organizations?.length) {
        setLoading(false);
        return;
      }

      const currentOrg = orgsData.organizations[0];
      setOrg(currentOrg);
      setOrgName(currentOrg.name);

      // Load members
      const membersRes = await fetch(`/api/orgs/${currentOrg.id}/members`);
      if (!membersRes.ok) throw new Error("Failed to load members");
      const membersData: MembersResponse = await membersRes.json();

      setMembers(membersData.members);
      setInvitations(membersData.invitations);
      setActorRole(membersData.actor_role);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const handleRename = async () => {
    if (!org || !orgName.trim()) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rename");
      }
      setOrg({ ...org, name: orgName.trim() });
      setEditingName(false);
      setStatus({ type: "success", message: "Organization renamed." });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to rename" });
    }
  };

  const handleInvite = async () => {
    if (!org || !inviteEmail.trim()) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite");
      }
      setInviteEmail("");
      setStatus({ type: "success", message: "Invitation sent." });
      loadOrg();
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to invite" });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!org) return;
    if (!confirm("Remove this member from the organization?")) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}/members?user_id=${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      setStatus({ type: "success", message: "Member removed." });
      loadOrg();
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to remove" });
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!org) return;
    if (!confirm("Revoke this invitation?")) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}/members?invite_id=${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke invitation");
      }
      setStatus({ type: "success", message: "Invitation revoked." });
      loadOrg();
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to revoke" });
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!org) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }
      setStatus({ type: "success", message: "Role updated." });
      loadOrg();
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to update role" });
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/org/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(token);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      // Fallback: select text
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedInviteId(token);
      setTimeout(() => setCopiedInviteId(null), 2000);
    }
  };

  const handleDeleteOrg = async () => {
    if (!org) return;
    if (!confirm(`Delete "${org.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      router.push("/dashboard");
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to delete" });
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-black tracking-tight">Organization Settings</h1>
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-black tracking-tight">Organization Settings</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t belong to any organization yet. Create one from the workspaces page.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
        Organization Settings
      </h1>

      {status && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          )}
        >
          {status.message}
        </div>
      )}

      {/* Org Name Section */}
      <section className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Organization</h2>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Name</label>
          {editingName ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                maxLength={120}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setOrgName(org.name);
                    setEditingName(false);
                  }
                }}
              />
              <button
                onClick={handleRename}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setOrgName(org.name);
                  setEditingName(false);
                }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm">{org.name}</span>
              {isManager && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">Slug</label>
          <p className="text-sm text-muted-foreground font-mono">{org.slug}</p>
        </div>
      </section>

      {/* Members Section */}
      <section className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Members</h2>
          <span className="text-sm text-muted-foreground">({members.length})</span>
        </div>

        {/* Invite Form */}
        {isManager && (
          <div className="flex gap-2 items-end border-b pb-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Invite by email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite();
                }}
              />
            </div>
            <div className="w-32 space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {ORG_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Member List */}
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-md border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {(member.display_name ?? member.email ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">
                    {member.display_name ?? member.email ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isManager && member.role !== "owner" && member.user_id !== org.owner_id ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleChangeRole(member.user_id, e.target.value)}
                    className="rounded-full border bg-transparent px-2 py-0.5 text-xs font-medium"
                  >
                    {ORG_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      ROLE_COLORS[member.role] ?? ROLE_COLORS.viewer
                    )}
                  >
                    {member.role === "owner" && <Crown className="mr-1 h-3 w-3" />}
                    {member.role === "admin" && <Shield className="mr-1 h-3 w-3" />}
                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                  </span>
                )}
                {isManager && member.role !== "owner" && member.user_id !== org.owner_id && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove member"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">Pending Invitations</p>
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-dashed px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{inv.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleCopyInviteLink(inv.token)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    title="Copy invite link"
                  >
                    {copiedInviteId === inv.token ? (
                      <span className="text-xs text-green-600">✓</span>
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {isManager && (
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Revoke invitation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      {isOwner && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Deleting this organization will permanently remove all data associated with it.
          </p>
          <button
            onClick={handleDeleteOrg}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 inline h-4 w-4" />
            Delete Organization
          </button>
        </section>
      )}
    </div>
  );
}
