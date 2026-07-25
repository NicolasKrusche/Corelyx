"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { UserEmailAutocomplete } from "@/components/admin/user-email-autocomplete";

// Admin controls for the explicit test-firm registry. A firm is designated here
// on purpose — never inferred from having a connector.

export function AddTestFirm() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const value = target.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    // An "@" means it's the firm's account email; otherwise treat as a workspace id.
    const body: Record<string, string> = { label: label.trim() };
    if (value.includes("@")) body.email = value;
    else body.workspace_id = value;
    try {
      const res = await fetch("/api/admin/test-firms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not add the test firm.");
        return;
      }
      setTarget("");
      setLabel("");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="test-firm-target" className="block text-xs font-medium text-muted-foreground">
            Workspace ID or firm email
          </label>
          <div className="mt-1">
            {/* Free text stays valid: this field also accepts a workspace UUID,
                which the directory has nothing to suggest for. */}
            <UserEmailAutocomplete
              id="test-firm-target"
              value={target}
              onChange={setTarget}
              onSubmit={() => void add()}
              placeholder="acme@firm.com  or  a1b2c3d4-…"
              disabled={busy}
              className="rounded-md focus:border-blue-500"
            />
          </div>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Label (firm name, optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Acme Corp"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !target.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {busy ? "Adding…" : "Add test firm"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Designates a firm for testing. This is deliberate — connecting an inbox does not make a workspace a test firm.
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function RemoveFirmButton({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    if (!confirm(`Remove "${name}" from the test-firm registry? This only un-designates it; nothing in their workspace is deleted.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/test-firms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={busy}
      title="Remove from test-firm registry"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-red-600 dark:text-red-400 disabled:opacity-60"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Remove
    </button>
  );
}
