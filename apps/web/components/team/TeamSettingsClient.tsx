"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InviteMemberModal } from "@/components/team/InviteMemberModal";
import { MemberList } from "@/components/team/MemberList";

type TeamRole = "admin" | "member" | "viewer";

interface Team {
  id: string;
  name: string;
  role: TeamRole;
  is_owner: boolean;
  member_count: number;
  created_at: string;
}

interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  invited_at: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function TeamSettingsClient({ currentUserId }: { currentUserId: string }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [actorRole, setActorRole] = useState<TeamRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);

  // Create team dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);

  // Delete team
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Rename team
  const [renameTarget, setRenameTarget] = useState<Team | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (data.teams) {
        setTeams(data.teams);
        // Auto-select first team if none selected
        if (!selectedTeamId && data.teams.length > 0) {
          setSelectedTeamId(data.teams[0].id);
        }
      }
    } catch {
      // Teams fetch failed
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  const fetchMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`);
      const data = await res.json();
      if (data.members) setMembers(data.members);
      if (data.actor_role) setActorRole(data.actor_role);
    } catch {
      // Members fetch failed
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      fetchMembers(selectedTeamId);
    }
  }, [selectedTeamId, fetchMembers]);

  const handleCreateTeam = useCallback(async () => {
    if (!newTeamName.trim()) {
      setCreateError("Team name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create team.");
        return;
      }

      // Add to list and select it
      if (data.team) {
        setTeams((prev) => [...prev, data.team]);
        setSelectedTeamId(data.team.id);
      }

      setNewTeamName("");
      setCreateOpen(false);
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }, [newTeamName]);

  const handleDeleteTeam = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/teams/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        if (selectedTeamId === deleteTarget.id) {
          setSelectedTeamId(null);
          setMembers([]);
          setActorRole(null);
        }
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, selectedTeamId]);

  const handleRenameTeam = useCallback(async () => {
    if (!renameTarget || !renameName.trim()) {
      setRenameError("Team name is required.");
      return;
    }

    setRenaming(true);
    setRenameError(null);

    try {
      const res = await fetch(`/api/teams/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRenameError(data.error ?? "Failed to rename team.");
        return;
      }

      setTeams((prev) =>
        prev.map((t) => (t.id === renameTarget.id ? { ...t, name: renameName.trim() } : t))
      );
      setRenameTarget(null);
      setRenameName("");
    } catch {
      setRenameError("Something went wrong. Please try again.");
    } finally {
      setRenaming(false);
    }
  }, [renameTarget, renameName]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
            Team
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your team, members, and permissions.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">Loading teams…</div>
      </div>
    );
  }

  return (
    <>
      {/* Create team dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
            <DialogDescription>
              Give your team a name. You&apos;ll be the owner and an admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="team-name" className="text-sm font-medium">
                Team name
              </label>
              <Input
                id="team-name"
                placeholder="e.g. Engineering, Marketing"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam();
                }}
                disabled={creating}
                autoFocus
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTeam} disabled={creating || !newTeamName.trim()}>
              {creating ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename team dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(v) => { if (!v) { setRenameTarget(null); setRenameName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
            <DialogDescription>
              Update the name for &ldquo;{renameTarget?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="rename-name" className="text-sm font-medium">
                New name
              </label>
              <Input
                id="rename-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameTeam();
                }}
                disabled={renaming}
                autoFocus
              />
            </div>
            {renameError && (
              <p className="text-sm text-destructive">{renameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setRenameTarget(null); setRenameName(""); }} disabled={renaming}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRenameTeam} disabled={renaming || !renameName.trim()}>
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete team confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete team"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will permanently remove the team and all its data. This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete team"}
        variant="destructive"
        onConfirm={handleDeleteTeam}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Invite member */}
      {selectedTeamId && (
        <InviteMemberModal
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          teamId={selectedTeamId}
          onInvited={() => {
            if (selectedTeamId) fetchMembers(selectedTeamId);
          }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              Team
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your team, members, and permissions.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            New team
          </Button>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center space-y-3">
            <p className="text-sm font-medium">No teams yet</p>
            <p className="text-sm text-muted-foreground">
              Create a team to collaborate with others on programs and workflows.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Team list sidebar */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Your teams</h2>
              <div className="space-y-1">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      team.id === selectedTeamId
                        ? "bg-accent font-medium"
                        : "hover:bg-accent/50 text-muted-foreground"
                    }`}
                  >
                    <span className="truncate">{team.name}</span>
                    <span className="text-xs capitalize shrink-0">{team.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Team details */}
            {selectedTeam ? (
              <div className="space-y-6">
                {/* Team header */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold">{selectedTeam.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedTeam.member_count} member{selectedTeam.member_count !== 1 ? "s" : ""} · Created {new Date(selectedTeam.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTeam.is_owner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setRenameTarget(selectedTeam);
                            setRenameName(selectedTeam.name);
                          }}
                        >
                          Rename
                        </Button>
                      )}
                      {selectedTeam.is_owner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(selectedTeam)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Members */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Members</h4>
                    {actorRole === "admin" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                        className="gap-1.5"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                          <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                        </svg>
                        Invite member
                      </Button>
                    )}
                  </div>
                  {membersLoading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading members…</div>
                  ) : (
                    <MemberList
                      members={members}
                      teamId={selectedTeamId!}
                      currentUserId={currentUserId}
                      actorRole={actorRole ?? "viewer"}
                      onChange={() => {
                        if (selectedTeamId) fetchMembers(selectedTeamId);
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                Select a team to view details.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
