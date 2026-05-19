"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROGRAM_ROLE_LABELS, WORKSPACE_ROLE_LABELS, type ProgramRole, type ProgramVisibility, type WorkspaceRole } from "@/lib/workspace-types";

type ShareMember = {
  user_id: string;
  workspace_role: WorkspaceRole;
  program_role: ProgramRole | null;
  display_name: string | null;
  username: string | null;
  email: string | null;
};

type ShareResponse = {
  visibility: ProgramVisibility;
  can_edit: boolean;
  members: ShareMember[];
};

const PROGRAM_ROLE_OPTIONS: Array<{ value: ProgramRole | ""; label: string }> = [
  { value: "", label: "Workspace default" },
  { value: "editor", label: "Editor" },
  { value: "runner", label: "Runner" },
  { value: "viewer", label: "Viewer" },
];

function InitialAvatar({ member, index }: { member: ShareMember; index: number }) {
  const label = member.display_name || member.email || member.user_id;
  const colors = ["bg-indigo-500", "bg-orange-500", "bg-emerald-500", "bg-sky-500"];

  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${colors[index % colors.length]}`}>
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SharePanel({ programId }: { programId: string }) {
  const [state, setState] = useState<ShareResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadShare() {
    const res = await fetch(`/api/programs/${programId}/share`, { cache: "no-store" });
    const body = await res.json().catch(() => null) as ShareResponse & { error?: string } | null;
    if (!res.ok || !body) {
      setMessage(body?.error ?? "Could not load sharing settings.");
      return;
    }
    setState(body);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadShare is stable within the programId scope
  useEffect(() => { void loadShare(); }, [programId]);

  async function updateShare(payload: { visibility?: ProgramVisibility; user_id?: string; role?: ProgramRole | null }) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/programs/${programId}/share`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error ?? "Sharing update failed.");
    } else {
      await loadShare();
    }
    setBusy(false);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Access</h2>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/workspaces">
            <Plus className="h-4 w-4" />
            Invite
          </Link>
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {!state ? (
          <p className="text-sm text-muted-foreground">Loading sharing settings...</p>
        ) : (
          <>
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Workspace visibility</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Workspace default lets members inherit access. Restricted only allows owners, admins, and explicit program roles.
              </p>
              <select
                className="mt-4 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={!state.can_edit || busy}
                value={state.visibility}
                onChange={(event) => updateShare({ visibility: event.target.value as ProgramVisibility })}
              >
                <option value="workspace">Workspace default</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Members · {state.members.length}
              </p>
              <div className="space-y-3">
                {state.members.map((member, index) => (
                  <div key={member.user_id} className="flex items-center gap-3">
                    <InitialAvatar member={member} index={index} />
                    <div className="min-w-0 flex-1">
                      {member.username ? (
                        <Link href={`/u/${member.username}`} className="truncate text-sm font-medium hover:underline">
                          {member.display_name || member.email || member.user_id}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium">
                          {member.display_name || member.email || member.user_id}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {member.workspace_role === "owner" ? "Workspace owner" : WORKSPACE_ROLE_LABELS[member.workspace_role]}
                        {member.program_role ? ` · ${PROGRAM_ROLE_LABELS[member.program_role]}` : ""}
                      </p>
                    </div>
                    <select
                      className="h-8 max-w-36 rounded-md border border-input bg-background px-2 text-xs"
                      disabled={!state.can_edit || busy || member.workspace_role === "owner" || member.workspace_role === "admin"}
                      value={member.program_role ?? ""}
                      onChange={(event) => {
                        const value = event.target.value as ProgramRole | "";
                        void updateShare({
                          user_id: member.user_id,
                          role: value === "" ? null : value,
                        });
                      }}
                    >
                      {member.workspace_role === "owner" || member.workspace_role === "admin" ? (
                        <option value="">Owner</option>
                      ) : (
                        PROGRAM_ROLE_OPTIONS.map((option) => (
                          <option key={option.value || "default"} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {message && <p className="text-xs text-destructive">{message}</p>}
        {state?.can_edit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadShare()}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh access
          </button>
        )}
      </div>
    </section>
  );
}
