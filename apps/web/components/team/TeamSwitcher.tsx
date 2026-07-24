"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ACTIVE_TEAM_COOKIE } from "@/lib/auth/team-context";

type TeamRole = "admin" | "member" | "viewer";

interface Team {
  id: string;
  name: string;
  role: TeamRole;
  is_owner: boolean;
  member_count: number;
}

interface TeamSwitcherProps {
  currentTeamId: string | null;
}

export function TeamSwitcher({ currentTeamId }: TeamSwitcherProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch teams on mount and whenever the dropdown opens
  useEffect(() => {
    if (!open && teams.length > 0) return;

    setLoading(true);
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => {
        if (data.teams) setTeams(data.teams);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const switchTeam = useCallback((teamId: string) => {
    // Set cookie server can read. Max-age 1 year so it persists.
    document.cookie = `${ACTIVE_TEAM_COOKIE}=${teamId}; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);
    // Reload to let server components re-resolve with the new cookie
    window.location.reload();
  }, []);

  const current = teams.find((t) => t.id === currentTeamId) ?? null;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="w-full justify-between gap-2 text-sm font-medium h-8 px-2"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {/* Team icon */}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0">
            <circle cx="6" cy="5" r="2.5" />
            <path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" strokeLinecap="round" />
            <circle cx="11.5" cy="4" r="1.75" />
            <path d="M14.5 14c0-2 1.2-3.5 3-4" strokeLinecap="round" />
          </svg>
          <span className="truncate">{current?.name ?? "No team"}</span>
        </span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0 opacity-60">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-md border border-border bg-popover shadow-md">
          {loading && teams.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading teams…</div>
          ) : teams.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No teams yet</div>
          ) : (
            <div role="listbox" className="max-h-60 overflow-y-auto p-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  aria-selected={team.id === currentTeamId}
                  onClick={() => switchTeam(team.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent transition-colors ${
                    team.id === currentTeamId ? "bg-accent font-medium" : ""
                  }`}
                >
                  <span className="truncate">{team.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground capitalize">{team.role}</span>
                    {team.id === currentTeamId && (
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-green-600 dark:text-green-400">
                        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
