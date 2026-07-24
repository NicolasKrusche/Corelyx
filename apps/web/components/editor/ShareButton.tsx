"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

type TeamRole = "admin" | "member" | "viewer";

interface Team {
  id: string;
  name: string;
  role: TeamRole;
}

interface ShareButtonProps {
  programId: string;
  programName: string;
}

export function ShareButton({ programId, programName }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [permission, setPermission] = useState<"view" | "edit" | "admin">("view");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch user's teams when dialog opens
  useEffect(() => {
    if (!open) return;

    setFetching(true);
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => {
        if (data.teams) {
          setTeams(data.teams);
          if (data.teams.length > 0) {
            setSelectedTeamId(data.teams[0].id);
          }
        }
      })
      .catch(() => setError("Could not load teams."))
      .finally(() => setFetching(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedTeamId("");
      setPermission("view");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  const handleShare = useCallback(async () => {
    if (!selectedTeamId) {
      setError("Please select a team.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/programs/${programId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: selectedTeamId, permission }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to share program.");
        return;
      }

      setSuccess(true);
      setTimeout(() => setOpen(false), 1200);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [programId, selectedTeamId, permission]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
        title="Share this program with a team"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
          <circle cx="4" cy="8" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M5.8 7L10.2 5M5.8 9L10.2 11" strokeLinecap="round" />
        </svg>
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share with team</DialogTitle>
            <DialogDescription>
              Grant a team access to &ldquo;{programName}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-300">
              Program shared successfully.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="share-team" className="text-sm font-medium">
                  Team
                </label>
                {fetching ? (
                  <div className="h-9 flex items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                    Loading teams…
                  </div>
                ) : teams.length === 0 ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    You don&apos;t belong to any teams yet.
                  </div>
                ) : (
                  <Select
                    id="share-team"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    disabled={loading}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="share-permission" className="text-sm font-medium">
                  Permission
                </label>
                <Select
                  id="share-permission"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as "view" | "edit" | "admin")}
                  disabled={loading}
                >
                  <option value="view">View — read-only</option>
                  <option value="edit">Edit — can modify the program</option>
                  <option value="admin">Admin — full control</option>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
              {success ? "Close" : "Cancel"}
            </Button>
            {!success && (
              <Button
                size="sm"
                onClick={handleShare}
                disabled={loading || !selectedTeamId || teams.length === 0}
              >
                {loading ? "Sharing…" : "Share"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
