"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type TeamRole = "admin" | "member" | "viewer";

interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  invited_at: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface MemberListProps {
  members: TeamMember[];
  teamId: string;
  currentUserId: string;
  actorRole: TeamRole;
  onChange?: () => void;
}

const ROLE_STYLES: Record<TeamRole, string> = {
  admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  member: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
};

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials || "?"}
    </div>
  );
}

export function MemberList({ members, teamId, currentUserId, actorRole, onChange }: MemberListProps) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TeamMember | null>(null);

  const handleRemove = useCallback(async (userId: string) => {
    setRemoving(userId);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/members/${userId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        onChange?.();
      }
    } finally {
      setRemoving(null);
      setConfirmTarget(null);
    }
  }, [teamId, onChange]);

  const handleRoleChange = useCallback(async (userId: string, newRole: TeamRole) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        onChange?.();
      }
    } catch {
      // Role change failed silently; the list will refresh on next action
    }
  }, [teamId, onChange]);

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No members yet. Invite someone to get started.
      </div>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmTarget}
        title="Remove member"
        description={
          confirmTarget?.user_id === currentUserId
            ? "Are you sure you want to leave this team?"
            : `Remove ${confirmTarget?.display_name || confirmTarget?.email || "this member"} from the team?`
        }
        confirmLabel={confirmTarget?.user_id === currentUserId ? "Leave team" : "Remove"}
        variant="destructive"
        onConfirm={() => {
          if (confirmTarget) handleRemove(confirmTarget.user_id);
        }}
        onCancel={() => setConfirmTarget(null)}
      />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Member</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const displayName = m.display_name || m.email?.split("@")[0] || "Unknown";
              const isSelf = m.user_id === currentUserId;
              const canManage = actorRole === "admin" && !isSelf;

              return (
                <tr
                  key={m.user_id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar url={m.avatar_url} name={displayName} />
                      <div>
                        <div className="font-medium">{displayName}</div>
                        {isSelf && (
                          <span className="text-xs text-muted-foreground">You</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleRoleChange(m.user_id, e.target.value as TeamRole)
                        }
                        className="rounded border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[m.role]}`}
                      >
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(actorRole === "admin" || isSelf) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={removing === m.user_id}
                        onClick={() => setConfirmTarget(m)}
                      >
                        {removing === m.user_id ? "Removing…" : isSelf ? "Leave" : "Remove"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
