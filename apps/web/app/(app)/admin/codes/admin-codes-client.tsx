"use client";

import { useEffect, useState, useCallback } from "react";
import { Copy, Check, RotateCcw, X } from "lucide-react";
import { UserEmailAutocomplete } from "@/components/admin/user-email-autocomplete";

const CODE_TYPES = [
  { value: "solo_lifetime",  label: "Solo — Lifetime" },
  { value: "team_lifetime",  label: "Team — Lifetime" },
  { value: "scale_lifetime", label: "Scale — Lifetime" },
  { value: "unlimited",      label: "Unlimited — Lifetime" },
  { value: "solo_trial",     label: "Solo — Trial (days)" },
  { value: "team_trial",     label: "Team — Trial (days)" },
  { value: "run_credits",    label: "Run Credits (+N runs)" },
  { value: "genesis_uses",   label: "Free Genesis Generations (+N one-time)" },
] as const;

type CodeType = typeof CODE_TYPES[number]["value"];

type RedemptionRow = {
  redeemed_at: string;
  profiles: { id: string; email: string; display_name: string | null } | null;
};

interface CodeRow {
  id: string;
  code: string;
  label: string | null;
  type: CodeType;
  value: { days?: number; runs?: number; uses?: number } | null;
  locked_to_email: string | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  redemptions: RedemptionRow[];
}

const TYPE_COLORS: Record<CodeType, string> = {
  solo_lifetime:  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  team_lifetime:  "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  scale_lifetime: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  unlimited:      "bg-primary/10 text-primary border-primary/20",
  solo_trial:     "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  team_trial:     "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  run_credits:    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  genesis_uses:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

function codeValueLabel(row: CodeRow): string {
  if (row.type === "solo_trial" || row.type === "team_trial") return `${row.value?.days ?? 30}d trial`;
  if (row.type === "run_credits") return `+${row.value?.runs ?? 100} runs`;
  if (row.type === "genesis_uses") return `+${row.value?.uses ?? 15} free Genesis`;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminCodesClient() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<CodeType>("solo_lifetime");
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [runAmount, setRunAmount] = useState("100");
  const [genesisUses, setGenesisUses] = useState("15");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [lockedEmail, setLockedEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  // Free text of the "lock to user" field; lockedEmail holds the picked address.
  const [userQuery, setUserQuery] = useState("");

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setNewCode(null);
    setSubmitting(true);

    const value =
      (type === "solo_trial" || type === "team_trial") ? { days: parseInt(trialDays, 10) } :
      type === "run_credits" ? { runs: parseInt(runAmount, 10) } :
      type === "genesis_uses" ? { uses: parseInt(genesisUses, 10) } :
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
      setLabel(""); setCustomCode(""); setLockedEmail(""); setMaxUses(""); setExpiresAt(""); setUserQuery("");
      void fetchCodes();
    }
    setSubmitting(false);
  }

  async function handleDeactivate(id: string) {
    setActionId(id);
    await fetch(`/api/admin/codes/${id}`, { method: "DELETE" });
    void fetchCodes();
    setActionId(null);
  }

  async function handleReactivate(id: string) {
    setActionId(id);
    await fetch(`/api/admin/codes/${id}`, { method: "PATCH" });
    void fetchCodes();
    setActionId(null);
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const activeCodes = codes.filter((c) => c.is_active);
  const inactiveCodes = codes.filter((c) => !c.is_active);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Code Manager</h2>
        <p className="text-sm text-muted-foreground mt-1">Generate and manage redemption codes for plan upgrades and credits.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Create form ── */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Generate code</h3>

            {newCode && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-2">Code created — copy and share:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-bold font-mono text-foreground bg-background rounded px-2.5 py-1.5 border border-border truncate">
                    {newCode}
                  </code>
                  <button
                    onClick={() => copyCode(newCode)}
                    className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors inline-flex items-center gap-1"
                  >
                    {copied === newCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === newCode ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5">
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

              {(type === "solo_trial" || type === "team_trial") && (
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
              {type === "genesis_uses" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Number of free Genesis generations</label>
                  <input
                    type="number" min="1"
                    value={genesisUses} onChange={(e) => setGenesisUses(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Genesis is normally paid for out of the account&apos;s AI credits. This grants N
                    generations that cost no credits at all, spent before any are charged. One-time —
                    not renewed each month. Set an expiry below to time-box a campaign.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Label <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <input
                  type="text" placeholder="e.g. AppSumo batch 1, Beta tester"
                  value={label} onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Custom code <span className="text-muted-foreground/50">(blank = auto-generate)</span>
                </label>
                <input
                  type="text" placeholder="LAUNCH2026"
                  value={customCode} onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Lock to user <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <UserEmailAutocomplete
                  value={userQuery}
                  onChange={(v) => { setUserQuery(v); setLockedEmail(""); }}
                  onSelect={(u) => setLockedEmail(u.email)}
                  placeholder="Search by email…"
                  disabled={submitting}
                  className="rounded-lg border-input focus:border-border focus:ring-1 focus:ring-primary/50"
                />
                {lockedEmail && (
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                    <span className="text-xs text-green-600 dark:text-green-400 flex-1 truncate">{lockedEmail}</span>
                    <button
                      type="button"
                      aria-label="Clear locked user"
                      onClick={() => { setLockedEmail(""); setUserQuery(""); }}
                      className="text-muted-foreground/50 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Max uses <span className="text-muted-foreground/50">(blank = ∞)</span>
                  </label>
                  <input
                    type="number" min="1" placeholder="1"
                    value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Expires</label>
                  <input
                    type="datetime-local"
                    value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
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
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Active <span className="text-muted-foreground/50">({activeCodes.length})</span>
            </h3>
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : activeCodes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No active codes.</div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {activeCodes.map((c) => (
                  <CodeItem
                    key={c.id}
                    code={c}
                    copied={copied}
                    expanded={expandedId === c.id}
                    isActioning={actionId === c.id}
                    onCopy={copyCode}
                    onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onDeactivate={() => handleDeactivate(c.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Inactive */}
          {!loading && inactiveCodes.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Inactive <span className="text-muted-foreground/50">({inactiveCodes.length})</span>
              </h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden opacity-60">
                {inactiveCodes.map((c) => (
                  <CodeItem
                    key={c.id}
                    code={c}
                    copied={copied}
                    expanded={expandedId === c.id}
                    isActioning={actionId === c.id}
                    onCopy={copyCode}
                    onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onReactivate={() => handleReactivate(c.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeItem({
  code: c,
  copied,
  expanded,
  isActioning,
  onCopy,
  onToggleExpand,
  onDeactivate,
  onReactivate,
}: {
  code: CodeRow;
  copied: string | null;
  expanded: boolean;
  isActioning: boolean;
  onCopy: (code: string) => void;
  onToggleExpand: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
}) {
  const typeLabel = CODE_TYPES.find((t) => t.value === c.type)?.label ?? c.type;
  const redemptions = c.redemptions ?? [];

  return (
    <div>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onCopy(c.code)}
              className="inline-flex items-center gap-1.5 text-sm font-bold font-mono text-foreground hover:text-primary transition-colors"
              title="Click to copy"
            >
              {copied === c.code ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 opacity-40" />}
              {c.code}
            </button>
            <span className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 ${TYPE_COLORS[c.type]}`}>
              {typeLabel} · {codeValueLabel(c)}
            </span>
            {c.label && (
              <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">{c.label}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <span>{c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""} uses</span>
            {c.locked_to_email && <span className="text-amber-600 dark:text-amber-400">locked: {c.locked_to_email}</span>}
            {c.expires_at && <span>expires {formatDate(c.expires_at)}</span>}
            <span>created {timeAgo(c.created_at)}</span>
            {redemptions.length > 0 && (
              <button
                onClick={onToggleExpand}
                className="text-primary hover:underline underline-offset-2"
              >
                {expanded ? "Hide" : "Show"} {redemptions.length} redemption{redemptions.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-0.5">
          {onDeactivate && (
            <button
              onClick={onDeactivate}
              disabled={isActioning}
              className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-40 inline-flex items-center gap-1"
              title="Deactivate"
            >
              <X className="h-3.5 w-3.5" />
              Deactivate
            </button>
          )}
          {onReactivate && (
            <button
              onClick={onReactivate}
              disabled={isActioning}
              className="text-xs text-muted-foreground/60 hover:text-primary transition-colors disabled:opacity-40 inline-flex items-center gap-1"
              title="Reactivate"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reactivate
            </button>
          )}
        </div>
      </div>

      {expanded && redemptions.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Redemptions</p>
          {redemptions.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono truncate">
                {r.profiles?.email ?? r.profiles?.id ?? "Unknown user"}
                {r.profiles?.display_name ? <span className="ml-1.5 text-foreground/60">({r.profiles.display_name})</span> : null}
              </span>
              <span className="shrink-0 ml-4">{formatDate(r.redeemed_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
