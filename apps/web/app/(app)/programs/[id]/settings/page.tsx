"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Program = {
  id: string;
  name: string;
  description: string | null;
  execution_mode: "autonomous" | "supervised" | "manual";
  conflict_policy: "queue" | "skip" | "fail";
};

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 py-6 border-t border-border/60 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="lg:col-span-2">{children}</div>
    </div>
  );
}

export default function ProgramSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [executionMode, setExecutionMode] = useState<Program["execution_mode"]>("supervised");
  const [conflictPolicy, setConflictPolicy] = useState<Program["conflict_policy"]>("queue");

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/programs/${id}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as Program;
      setProgram(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setExecutionMode(data.execution_mode);
      setConflictPolicy(data.conflict_policy);
      setLoading(false);
    }
    void load();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    const res = await fetch(`/api/programs/${id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, execution_mode: executionMode, conflict_policy: conflictPolicy }),
    });

    setSaveStatus(res.ok
      ? { type: "success", message: "Settings saved." }
      : { type: "error", message: "Failed to save settings." }
    );
    setSaving(false);
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== program?.name) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/programs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDeleteError(body.error ?? "Failed to delete program.");
      setDeleting(false);
      return;
    }
    router.push("/dashboard");
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!program) {
    return <div className="text-sm text-muted-foreground">Program not found.</div>;
  }

  return (
    <div className="max-w-3xl space-y-0">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href={`/programs/${id}`} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors mb-2 inline-block">
            ← Back to program
          </Link>
          <h1 className="text-3xl font-black tracking-tight">Program settings</h1>
          <p className="text-sm text-muted-foreground mt-1">{program.name}</p>
        </div>
      </div>

      {/* Name */}
      <form onSubmit={handleSave}>
        <Field label="Name" description="A short, descriptive name for this program.">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
          />
        </Field>

        <Field label="Description" description="Optional notes about what this program does.">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
            placeholder="Optional description…"
          />
        </Field>

        <Field label="Execution mode" description="Controls how much human oversight is required during a run.">
          <div className="space-y-2">
            {(["autonomous", "supervised", "manual"] as const).map((mode) => (
              <label key={mode} className="flex items-start gap-3 rounded-lg border glass-card px-4 py-3 cursor-pointer hover:bg-accent transition-colors">
                <input
                  type="radio"
                  name="execution_mode"
                  value={mode}
                  checked={executionMode === mode}
                  onChange={() => setExecutionMode(mode)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium capitalize">{mode}</p>
                  <p className="text-xs text-muted-foreground">
                    {mode === "autonomous" && "Runs without any interruptions."}
                    {mode === "supervised" && "Pauses at approval nodes for human sign-off."}
                    {mode === "manual" && "Only runs when triggered manually."}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Conflict policy" description="What to do when a run is triggered while another run of this program is already active.">
          <div className="space-y-2">
            {(["queue", "skip", "fail"] as const).map((policy) => (
              <label key={policy} className="flex items-start gap-3 rounded-lg border glass-card px-4 py-3 cursor-pointer hover:bg-accent transition-colors">
                <input
                  type="radio"
                  name="conflict_policy"
                  value={policy}
                  checked={conflictPolicy === policy}
                  onChange={() => setConflictPolicy(policy)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium capitalize">{policy}</p>
                  <p className="text-xs text-muted-foreground">
                    {policy === "queue" && "New run waits until the current one finishes."}
                    {policy === "skip" && "New run is silently dropped."}
                    {policy === "fail" && "New run fails immediately with a conflict error."}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        {saveStatus && (
          <div className={`rounded-lg px-3 py-2 text-xs border mb-4 ${
            saveStatus.type === "success"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {saveStatus.message}
          </div>
        )}

        <div className="pt-2 border-t border-border/60">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="pt-8 border-t border-border/60 mt-8">
        <h2 className="text-sm font-semibold mb-1">Danger zone</h2>
        <p className="text-xs text-muted-foreground mb-4">Permanently delete this program, all its runs, and all execution history. This cannot be undone.</p>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <form onSubmit={handleDelete} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Type <span className="font-mono text-foreground">{program.name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-destructive/50 focus:border-destructive/40 transition-all"
                placeholder={program.name}
              />
            </div>

            {deleteError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{deleteError}</p>
            )}

            <button
              type="submit"
              disabled={deleting || deleteConfirm !== program.name}
              className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {deleting ? "Deleting…" : "Delete program"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
