"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EnvVar = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5 10 12l-3.25 4.5M13.5 16.5h3.75M3.75 21h16.5A1.75 1.75 0 0 0 22 19.25V4.75A1.75 1.75 0 0 0 20.25 3H3.75A1.75 1.75 0 0 0 2 4.75v14.5A1.75 1.75 0 0 0 3.75 21Z" />
    </svg>
  );
}

export default function EnvVarsPage() {
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit (rotate) dialog
  const [editVar, setEditVar] = useState<EnvVar | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/env-vars");
    if (res.ok) setVars(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function validateName(raw: string): string | null {
    if (!raw) return null;
    if (!ENV_NAME_RE.test(raw)) return "Must be UPPER_SNAKE_CASE (letters, digits, underscores; cannot start with a digit)";
    return null;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const err = validateName(form.name);
    if (err) { setNameError(err); return; }
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/env-vars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), value: form.value }),
    });
    if (res.ok) {
      setAddOpen(false);
      setForm({ name: "", value: "" });
      setNameError(null);
      load();
    } else {
      const data = await res.json() as { error?: string };
      setSaveError(data.error ?? "Failed to save variable");
    }
    setSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editVar) return;
    setEditing(true);
    setEditError(null);
    const res = await fetch(`/api/env-vars/${editVar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: editValue }),
    });
    if (res.ok) {
      setEditVar(null);
      setEditValue("");
      load();
    } else {
      const data = await res.json() as { error?: string };
      setEditError(data.error ?? "Failed to update variable");
    }
    setEditing(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/env-vars/${id}`, { method: "DELETE" });
    setVars((prev) => prev.filter((v) => v.id !== id));
    setDeleting(null);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Environment Variables</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Encrypted key/value pairs available to all workflows in this workspace as{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">$env.VARIABLE_NAME</code>.
          </p>
        </div>
        <Button onClick={() => { setAddOpen(true); setSaveError(null); }} size="sm">
          Add variable
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-xl border glass-card p-8 text-center">
          <p className="text-xs text-muted-foreground/50">Loading…</p>
        </div>
      ) : vars.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white/[0.02] backdrop-blur-md p-14 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border glass-card text-muted-foreground/40 mb-4">
            <TerminalIcon />
          </div>
          <p className="text-sm font-medium mb-1">No variables yet</p>
          <p className="text-xs text-muted-foreground/60 mb-5">
            Add a variable to reference it in any node config as{" "}
            <code className="font-mono">$env.NAME</code>.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>Add first variable</Button>
        </div>
      ) : (
        <div className="rounded-xl border glass-card divide-y divide-border/60 overflow-hidden">
          {vars.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/30 transition-colors">
              {/* Name */}
              <code className="flex-1 min-w-0 font-mono text-sm font-semibold truncate text-foreground">
                {v.name}
              </code>

              {/* Masked value */}
              <span className="font-mono text-xs text-muted-foreground/40 shrink-0 select-none tracking-widest">
                ••••••••
              </span>

              {/* Timestamps */}
              <span
                className="text-[11px] text-muted-foreground/50 font-mono shrink-0"
                title={`Updated ${new Date(v.updated_at).toLocaleString()}`}
              >
                {v.updated_at !== v.created_at ? "updated " : "added "}
                {timeAgo(v.updated_at)}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={() => { setEditVar(v); setEditValue(""); setEditError(null); }}
                >
                  Rotate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2 text-muted-foreground/60 hover:text-destructive"
                  disabled={deleting === v.id}
                  onClick={() => handleDelete(v.id)}
                >
                  {deleting === v.id ? "…" : "Remove"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setForm({ name: "", value: "" }); setNameError(null); setSaveError(null); } }}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add environment variable</DialogTitle>
              <DialogDescription>
                The value is encrypted immediately and never stored in plaintext.
                Reference it in any workflow node as{" "}
                <code className="font-mono text-xs">$env.NAME</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="env-name">Name</Label>
                <Input
                  id="env-name"
                  className="mt-1 font-mono uppercase"
                  placeholder="MY_VARIABLE"
                  required
                  value={form.name}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
                    setForm((f) => ({ ...f, name: v }));
                    setNameError(validateName(v));
                  }}
                />
                {nameError && (
                  <p className="mt-1 text-xs text-destructive">{nameError}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  UPPER_SNAKE_CASE — letters, digits, and underscores only.
                </p>
              </div>

              <div>
                <Label htmlFor="env-value">Value</Label>
                <Input
                  id="env-value"
                  type="password"
                  className="mt-1"
                  placeholder="Enter secret value"
                  required
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !!nameError}>
                {saving ? "Saving…" : "Save variable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rotate value dialog */}
      <Dialog open={!!editVar} onOpenChange={(o) => { if (!o) { setEditVar(null); setEditValue(""); setEditError(null); } }}>
        <DialogContent>
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>
                Rotate{" "}
                <code className="font-mono text-sm">{editVar?.name}</code>
              </DialogTitle>
              <DialogDescription>
                Enter the new value. The old value will be permanently deleted from the vault.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-value">New value</Label>
                <Input
                  id="edit-value"
                  type="password"
                  className="mt-1"
                  placeholder="Enter new secret value"
                  required
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditVar(null)}>Cancel</Button>
              <Button type="submit" disabled={editing || !editValue}>
                {editing ? "Rotating…" : "Rotate value"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
