"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type ApiKey = {
  id: string;
  name: string;
  provider: string;
  is_valid: boolean;
  last_validated_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PROVIDERS = [
  { value: "anthropic",   label: "Anthropic" },
  { value: "openai",      label: "OpenAI" },
  { value: "openrouter",  label: "OpenRouter" },
  { value: "google",      label: "Google (Gemini)" },
  { value: "mistral",     label: "Mistral" },
  { value: "cohere",      label: "Cohere" },
  { value: "groq",        label: "Groq" },
  { value: "other",       label: "Other" },
] as const;

const PROVIDER_COLORS: Record<string, string> = {
  anthropic:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  openai:     "bg-green-500/10 text-green-400 border-green-500/20",
  openrouter: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  google:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  mistral:    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  cohere:     "bg-teal-500/10 text-teal-400 border-teal-500/20",
  groq:       "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

export default function ApiKeysPage() {
  const t = useTranslations("apiKeys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "anthropic", customProvider: "", key: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        setKeys(await res.json());
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        setLoadError(body.message ?? body.error ?? "Could not load your API keys. Please refresh the page.");
      }
    } catch {
      setLoadError("Could not reach the server. Check your connection and refresh.");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const provider = form.provider === "other" ? form.customProvider.trim().toLowerCase() : form.provider;
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, provider, key: form.key }),
    });
    if (res.ok) {
      setDialogOpen(false);
      setForm({ name: "", provider: "anthropic", customProvider: "", key: "" });
      load();
    } else {
      const data = await res.json() as { error?: string };
      setError(friendlyResponseMessage(data, "We could not save this API key. Please try again."));
    }
    setSaving(false);
  }

  async function handleValidate(id: string) {
    setValidating(id);
    await fetch(`/api/keys/${id}`, { method: "POST" });
    load();
    setValidating(null);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setDeleting(null);
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {t("description")}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">{t("addKey")}</Button>
      </div>

      {loading ? (
        <div className="rounded-xl border glass-card p-8 text-center">
          <p className="text-xs text-muted-foreground/50">Loading…</p>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive mb-1">Failed to load API keys</p>
          <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white/[0.02] backdrop-blur-md p-14 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border glass-card text-muted-foreground/40 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <p className="text-sm font-medium mb-1">{t("noKeys")}</p>
          <p className="text-xs text-muted-foreground/60 mb-5">{t("noKeysDesc")}</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>{t("addFirstKey")}</Button>
        </div>
      ) : (
        <div className="rounded-xl border glass-card divide-y divide-border/60 overflow-hidden">
          {keys.map((key) => {
            const providerLabel = PROVIDERS.find((p) => p.value === key.provider)?.label ?? key.provider;
            const colorCls = PROVIDER_COLORS[key.provider] ?? "bg-muted/60 text-muted-foreground border-border";
            return (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/30 transition-colors">
                {/* Provider pill */}
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold font-mono shrink-0 ${colorCls}`}>
                  {providerLabel}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{key.name}</p>
                  <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground/50 font-mono">
                    <span title={key.last_used_at ? new Date(key.last_used_at).toLocaleString() : undefined}>
                      {key.last_used_at
                        ? <>{t("used")} {timeAgo(key.last_used_at)}</>
                        : <span className="text-muted-foreground/30">{t("neverUsed")}</span>}
                    </span>
                    {key.last_validated_at && (
                      <>
                        <span className="opacity-30">·</span>
                        <span title={new Date(key.last_validated_at).toLocaleString()}>
                          {t("validated")} {timeAgo(key.last_validated_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <Badge variant={key.is_valid ? "success" : "destructive"}>
                  {key.is_valid ? "Valid" : "Invalid"}
                </Badge>

                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2"
                    disabled={validating === key.id} onClick={() => handleValidate(key.id)}>
                    {validating === key.id ? t("validating") : t("validate")}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-muted-foreground/60 hover:text-destructive"
                    disabled={deleting === key.id} onClick={() => handleDelete(key.id)}>
                    {deleting === key.id ? t("removing") : t("remove")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>{t("addKeyTitle")}</DialogTitle>
              <DialogDescription>
                {t("addKeyDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="provider">{t("providerLabel")}</Label>
                <Select
                  id="provider"
                  className="mt-1"
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value, customProvider: "" }))}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
                {form.provider === "other" && (
                  <Input
                    className="mt-2"
                    placeholder="Provider name (e.g. together-ai)"
                    required
                    value={form.customProvider}
                    onChange={(e) => setForm((f) => ({ ...f, customProvider: e.target.value }))}
                  />
                )}
              </div>
              <div>
                <Label htmlFor="name">{t("nameLabel")}</Label>
                <Input
                  id="name"
                  className="mt-1"
                  placeholder="e.g. Production Anthropic"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="key">{t("keyLabel")}</Label>
                <Input
                  id="key"
                  type="password"
                  className="mt-1"
                  placeholder="sk-…"
                  required
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={saving}>{saving ? t("saving") : t("saveKey")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
