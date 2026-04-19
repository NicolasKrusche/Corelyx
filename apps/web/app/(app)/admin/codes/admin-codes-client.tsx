"use client";

import { useEffect, useState, useCallback } from "react";

const CODE_TYPES = [
  { value: "pro_lifetime",      label: "Pro — Lifetime" },
  { value: "builder_lifetime",  label: "Builder — Lifetime" },
  { value: "unlimited",         label: "Unlimited — Lifetime" },
  { value: "pro_trial",         label: "Pro — Trial (days)" },
  { value: "run_credits",       label: "Run Credits (+N runs)" },
] as const;

type CodeType = typeof CODE_TYPES[number]["value"];

interface CodeRow {
  id: string;
  code: string;
  label: string | null;
  type: CodeType;
  value: { days?: number; runs?: number } | null;
  locked_to_email: string | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface UserResult {
  id: string;
  email: string;
}

const TIER_COLORS: Record<CodeType, string> = {
  pro_lifetime:     "bg-purple-500/10 text-purple-400 border-purple-500/20",
  builder_lifetime: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  unlimited:        "bg-primary/10 text-primary border-primary/20",
  pro_trial:        "bg-purple-500/10 text-purple-400 border-purple-500/20",
  run_credits:      "bg-green-500/10 text-green-400 border-green-500/20",
};

function codeValueLabel(row: CodeRow): string {
  if (row.type === "pro_trial") return `${row.value?.days ?? 30}d trial`;
  if (row.type === "run_credits") return `+${row.value?.runs ?? 100} runs`;
  return "lifetime";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AdminCodesClient() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<CodeType>("pro_lifetime");
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [runAmount, setRunAmount] = useState("100");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [lockedEmail, setLockedEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  // User search
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/codes");
    if (res.ok) {
      const data = await res.json() as { codes: CodeRow[] };
      setCodes(data.codes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchCodes(); }, [fetchCodes]);

  useEffect(() => {
    if (userQuery.length < 3) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(userQuery)}`);
      if (res.ok) {
        const data = await res.json() as { users: UserResult[] };
        setUserResults(data.users ?? []);
      }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setNewCode(null);
    setSubmitting(true);

    const value =
      type === "pro_trial" ? { days: parseInt(trialDays, 10) } :
      type === "run_credits" ? { runs: parseInt(runAmount, 10) } :
      undefined;

    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: customCode || undefined,
        label: label || undefined,
        type,
        value,
        locked_to_email: lockedEmail || undefined,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    });

    const data = await res.json() as { code?: CodeRow; error?: string };

    if (!res.ok) {
      setCreateError(data.error ?? "Failed to create code.");
    } else {
      setNewCode(data.code!.code);
      setLabel(""); setCustomCode(""); setLockedEmail(""); setMaxUses(""); setExpiresAt(""); setUserQuery(""); setUserResults([]);
      void fetchCodes();
    }
    setSubmitting(false);
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/admin/codes/${id}`, { method: "DELETE" });
    void fetchCodes();
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const activeCodes = codes.filter((c) => c.is_active);
  const inactiveCodes = codes.filter((c) => !c.is_active);

  return (
    <div className="space-y-8 max-w-6xl">

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Admin</p>
        <h1 className="text-3xl font-black tracking-tight">Code Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate and manage redemption codes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Create form ── */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-sm font-semibold">Generate code</h2>

            {newCode && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/8 p-4">
                <p className="text-xs text-green-400 font-medium mb-2">Code created — copy and send it:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-bold font-mono text-foreground bg-background rounded px-3 py-1.5 border border-border">
                    {newCode}
                  </code>
                  <button
                    onClick={() => copyCode(newCode)}
                    className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    {copied === newCode ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Code type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CodeType)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {CODE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Type-specific value */}
              {type === "pro_trial" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Trial duration (days)</label>
                  <input
                    type="number" min="1" max="365"
                    value={trialDays} onChange={(e) => setTrialDays(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              )}
              {type === "run_credits" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Number of runs</label>
                  <input
                    type="number" min="1"
                    value={runAmount} onChange={(e) => setRunAmount(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Label <span className="text-muted-foreground/40">(optional)</span></label>
                <input
                  type="text" placeholder="e.g. AppSumo LTD, Beta Tester"
                  value={label} onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Custom code */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custom code <span className="text-muted-foreground/40">(leave blank to auto-generate)</span></label>
                <input
                  type="text" placeholder="LAUNCH2026"
                  value={customCode} onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Lock to user */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Lock to user <span className="text-muted-foreground/40">(optional — search by email)</span></label>
                <div className="relative">
                  <input
                    type="text" placeholder="Search email…"
                    value={userQuery} onChange={(e) => { setUserQuery(e.target.value); setLockedEmail(""); }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {lockedEmail && (
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/8 px-3 py-2">
                      <span className="text-xs text-green-400 flex-1 truncate">{lockedEmail}</span>
                      <button type="button" onClick={() => { setLockedEmail(""); setUserQuery(""); }} className="text-muted-foreground/50 hover:text-foreground text-xs">×</button>
                    </div>
                  )}
                  {userResults.length > 0 && !lockedEmail && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                      {searchLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
                      {userResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setLockedEmail(u.email); setUserQuery(u.email); setUserResults([]); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors truncate"
                        >
                          {u.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Max uses */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Max uses <span className="text-muted-foreground/40">(blank = unlimited)</span></label>
                <input
                  type="number" min="1" placeholder="e.g. 1 for single-use"
                  value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Expires at */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Code expires <span className="text-muted-foreground/40">(optional)</span></label>
                <input
                  type="datetime-local"
                  value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {createError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{createError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? "Generating…" : "Generate code"}
              </button>
            </form>
          </div>
        </div>

        {/* ── Code list ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Active */}
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
              Active <span className="ml-1 text-foreground/40">({activeCodes.length})</span>
            </h2>
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : activeCodes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No active codes yet.</div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden">
                {activeCodes.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code
                          className="text-sm font-bold font-mono text-foreground cursor-pointer hover:text-primary transition-colors"
                          onClick={() => copyCode(c.code)}
                          title="Click to copy"
                        >
                          {c.code}
                        </code>
                        {copied === c.code && <span className="text-[10px] text-green-400">Copied!</span>}
                        <span className={`text-[10px] font-semibold font-mono border rounded px-1.5 py-0.5 ${TIER_COLORS[c.type]}`}>
                          {CODE_TYPES.find((t) => t.value === c.type)?.label} · {codeValueLabel(c)}
                        </span>
                        {c.label && (
                          <span className="text-[10px] text-muted-foreground/50 border border-border rounded px-1.5 py-0.5">{c.label}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50 font-mono flex-wrap">
                        <span>{c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""} uses</span>
                        {c.locked_to_email && <span className="text-amber-400/70">🔒 {c.locked_to_email}</span>}
                        {c.expires_at && <span>expires {new Date(c.expires_at).toLocaleDateString()}</span>}
                        <span>created {timeAgo(c.created_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeactivate(c.id)}
                      className="shrink-0 text-xs text-muted-foreground/40 hover:text-destructive transition-colors mt-0.5"
                      title="Deactivate"
                    >
                      Deactivate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive */}
          {inactiveCodes.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
                Inactive <span className="ml-1 text-foreground/40">({inactiveCodes.length})</span>
              </h2>
              <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden opacity-50">
                {inactiveCodes.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
                    <code className="text-sm font-mono font-bold line-through">{c.code}</code>
                    <span className="text-[10px] font-mono">{c.uses_count} uses · {CODE_TYPES.find((t) => t.value === c.type)?.label}</span>
                    {c.label && <span className="text-[10px]">{c.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
