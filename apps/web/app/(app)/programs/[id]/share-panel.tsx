"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PROGRAM_ROLE_LABELS, WORKSPACE_ROLE_LABELS, type ProgramRole, type ProgramVisibility, type WorkspaceRole } from "@/lib/workspace-types";

type ShareMember = {
  user_id: string;
  workspace_role: WorkspaceRole;
  program_role: ProgramRole | null;
  display_name: string | null;
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

  useEffect(() => {
    void loadShare();
  }, [programId]);

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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Workspace access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state ? (
          <p className="text-sm text-muted-foreground">Loading sharing settings...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Program visibility</p>
                <p className="text-xs text-muted-foreground">
                  Workspace default lets members inherit access. Restricted only allows owners, admins, and explicit program roles.
                </p>
              </div>
              <select
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                disabled={!state.can_edit || busy}
                value={state.visibility}
                onChange={(event) => updateShare({ visibility: event.target.value as ProgramVisibility })}
              >
                <option value="workspace">Workspace default</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>

            <div className="divide-y divide-border rounded-lg border border-border">
              {state.members.map((member) => (
                <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.display_name || member.email || member.user_id}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{WORKSPACE_ROLE_LABELS[member.workspace_role]}</Badge>
                      {member.program_role && (
                        <Badge variant="secondary">{PROGRAM_ROLE_LABELS[member.program_role]}</Badge>
                      )}
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
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
                    {PROGRAM_ROLE_OPTIONS.map((option) => (
                      <option key={option.value || "default"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {message && <p className="text-xs text-destructive">{message}</p>}
        {state?.can_edit && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void loadShare()}>
            Refresh access
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
