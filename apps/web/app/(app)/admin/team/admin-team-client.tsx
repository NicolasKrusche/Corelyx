"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { UserEmailAutocomplete } from "@/components/admin/user-email-autocomplete";
import type { TeamMember } from "@/app/api/admin/team/route";

const ROLE_OPTIONS = [
  { value: null,        label: "No role"   },
  { value: "founder",   label: "Founder"   },
  { value: "dev",       label: "Developer" },
  { value: "support",   label: "Support"   },
  { value: "marketing", label: "Marketing" },
] as const;

const ROLE_COLOR: Record<string, string> = {
  founder:   "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  dev:       "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  support:   "bg-green-500/10 text-green-700 dark:text-green-300",
  marketing: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder", dev: "Developer", support: "Support", marketing: "Marketing",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminTeamClient() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add member form
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/team");
    if (res.ok) {
      const data = await res.json() as { members: TeamMember[] };
      setMembers(data.members);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateRole(userId: string, role: string | null) {
    setSaving(userId);
    setError(null);
    const res = await fetch("/api/admin/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, team_role: role }),
    });
    if (res.ok) {
      setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, team_role: role as TeamMember["team_role"] } : m));
    } else {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "Failed to update role.");
    }
    setSaving(null);
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this person from the team? Their account stays intact.")) return;
    setRemoving(userId);
    setError(null);
    const res = await fetch("/api/admin/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } else {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "Failed to remove member.");
    }
    setRemoving(null);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addEmail.trim(), team_role: addRole }),
    });
    if (res.ok) {
      const data = await res.json() as { member: TeamMember };
      setMembers((prev) => [...prev, data.member]);
      setAddEmail("");
      setAddRole(null);
    } else {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setAddError(body?.error ?? "Failed to add member.");
    }
    setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage who has admin access and what role they have. Roles appear publicly on their profile page.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Member list */}
      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="space-y-px p-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 rounded-xl px-4 py-3">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-muted" />
                  <div className="h-3 w-48 rounded bg-muted" />
                </div>
                <div className="h-7 w-28 rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const initial = (m.display_name || m.email).slice(0, 1).toUpperCase();
              const name = m.display_name || m.email;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {initial}
                    {m.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.username ? (
                        <Link href={`/u/${m.username}`} className="truncate text-sm font-medium hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium">{name}</p>
                      )}
                      {m.team_role && (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ROLE_COLOR[m.team_role])}>
                          {ROLE_LABEL[m.team_role]}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}{m.username ? ` · @${m.username}` : ""} · since {fmt(m.created_at)}
                    </p>
                  </div>

                  {/* Role picker */}
                  <select
                    value={m.team_role ?? ""}
                    onChange={(e) => void updateRole(m.id, e.target.value || null)}
                    disabled={saving === m.id}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={String(o.value)} value={o.value ?? ""}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => void removeMember(m.id)}
                    disabled={removing === m.id}
                    className="ml-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors"
                  >
                    {removing === m.id ? "…" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add member */}
      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <p className="text-sm font-semibold">Add team member</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The user must already have a Corelyx account. They&apos;ll get admin access immediately.
        </p>
        <form onSubmit={(e) => void addMember(e)} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="team-add-email" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <UserEmailAutocomplete
              id="team-add-email"
              value={addEmail}
              onChange={setAddEmail}
              placeholder="team@corelyx.app"
              required
              disabled={adding}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Role</label>
            <select
              value={addRole ?? ""}
              onChange={(e) => setAddRole(e.target.value || null)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value ?? ""}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to team"}
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-xs text-destructive">{addError}</p>
        )}
      </div>
    </div>
  );
}
