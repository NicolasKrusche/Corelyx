"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeSummary = {
  total: number;
  connections_needed: string[];
  has_ai: boolean;
};

type PublicProgram = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  public_author_name: string | null;
  schema_version: number;
  node_summary: NodeSummary;
};

const PROVIDER_LABELS: Record<string, string> = {
  airtable: "Airtable",
  asana: "Asana",
  calendar: "Google Calendar",
  docs: "Google Docs",
  drive: "Google Drive",
  github: "GitHub",
  gmail: "Gmail",
  hubspot: "HubSpot",
  notion: "Notion",
  outlook: "Outlook",
  sheets: "Google Sheets",
  slack: "Slack",
  typeform: "Typeform",
};

const PROVIDER_ICON_URL: Record<string, string> = {
  airtable: "https://www.google.com/s2/favicons?domain=airtable.com&sz=64",
  asana: "https://www.google.com/s2/favicons?domain=app.asana.com&sz=64",
  calendar: "https://commons.wikimedia.org/wiki/Special:FilePath/Google_Calendar_icon_(2020).svg",
  docs: "https://upload.wikimedia.org/wikipedia/commons/6/66/Google_Docs_2020_Logo.svg",
  drive: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
  github: "https://commons.wikimedia.org/wiki/Special:FilePath/GitHub_Invertocat_Logo.svg",
  gmail: "https://commons.wikimedia.org/wiki/Special:FilePath/Gmail_icon_(2020).svg",
  hubspot: "https://upload.wikimedia.org/wikipedia/commons/3/3f/HubSpot_Logo.svg",
  notion: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
  outlook: "https://upload.wikimedia.org/wikipedia/commons/4/45/Microsoft_Office_Outlook_%282018%E2%80%932024%29.svg",
  sheets: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Google_Sheets_2020_Logo.svg",
  slack: "https://commons.wikimedia.org/wiki/Special:FilePath/Slack_icon_2019.svg",
  typeform: "https://www.google.com/s2/favicons?domain=typeform.com&sz=64",
};

const PROVIDER_ALIASES: Record<string, string> = {
  google_calendar: "calendar",
  google_docs: "docs",
  google_drive: "drive",
  google_sheets: "sheets",
  googlecalendar: "calendar",
  googledocs: "docs",
  googledrive: "drive",
  googlesheets: "sheets",
  microsoft_outlook: "outlook",
  outlook_mail: "outlook",
};

// ─── Browse page ──────────────────────────────────────────────────────────────

export function BrowseClient({
  initialPrograms,
  initialTotal,
}: {
  initialPrograms: PublicProgram[];
  initialTotal: number;
}) {
  const router = useRouter();
  const [programs, setPrograms] = useState<PublicProgram[]>(initialPrograms);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [forking, setForking] = useState<string | null>(null);
  const [forked, setForked] = useState<Record<string, string>>({}); // id → new program id
  const [forkError, setForkError] = useState<string | null>(null); // fix: inline error surface for fork failures

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only re-fetch when filters are actually set — initial data comes from server
  useEffect(() => {
    if (!q && !activeTag) {
      setPrograms(initialPrograms);
      setTotal(initialTotal);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    let cancelled = false;

    const doFetch = (searchQ: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTag) params.set("tag", activeTag);
      if (searchQ) params.set("q", searchQ);

      fetch(`/api/browse?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load");
          return res.json() as Promise<{ programs: PublicProgram[]; total: number }>;
        })
        .then((data) => {
          if (!cancelled) { setPrograms(data.programs); setTotal(data.total); }
        })
        .catch(() => { if (!cancelled) setPrograms([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    if (q) {
      debounceRef.current = setTimeout(() => doFetch(q), 350);
    } else {
      doFetch("");
    }

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, activeTag, initialPrograms, initialTotal]);

  // Collect all unique tags across loaded programs for the filter bar
  const allTags = [...new Set(programs.flatMap((p) => p.tags))].sort();

  async function handleFork(programId: string) {
    // fix: give user a visible response on every outcome — navigate on success, show inline error on failure
    setForking(programId);
    setForkError(null);
    try {
      const res = await fetch(`/api/browse/${programId}/fork`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setForkError(body.error ?? "Failed to use program");
        return;
      }
      const data = (await res.json()) as { program: { id: string } };
      setForked((prev) => ({ ...prev, [programId]: data.program.id }));
      router.push(`/programs/${data.program.id}`);
    } catch {
      setForkError("Failed to use program. Check your network and try again.");
    } finally {
      setForking(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Browse</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total > 0 ? `${total} program${total !== 1 ? "s" : ""} available` : "Community-published automation programs"}
          {" - use one to start from a working blueprint."}
        </p>
      </div>

      {/* fix: inline fork error banner (replaces silent alert) */}
      {forkError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-center justify-between gap-3">
          <span>{forkError}</span>
          <button
            onClick={() => setForkError(null)}
            className="text-xs underline underline-offset-2 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search programs..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                activeTag === null
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                  activeTag === tag
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">
            {q || activeTag ? "No programs match your search." : "No programs have been published yet."}
          </p>
          {(q || activeTag) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => { setQ(""); setActiveTag(null); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              onFork={handleFork}
              forking={forking === program.id}
              forkedId={forked[program.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Program card ─────────────────────────────────────────────────────────────

function ProgramCard({
  program,
  onFork,
  forking,
  forkedId,
}: {
  program: PublicProgram;
  onFork: (id: string) => void;
  forking: boolean;
  forkedId?: string;
}) {
  const summary = program.node_summary;

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col p-5 gap-3 hover:border-foreground/20 transition-colors">
      {/* Name + tags */}
      <div className="space-y-1.5">
        <h2 className="text-sm font-semibold leading-snug line-clamp-2">{program.name}</h2>
        {program.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>
        )}
      </div>

      {/* Tags */}
      {program.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {program.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Node summary */}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <span>{summary.total} node{summary.total !== 1 ? "s" : ""}</span>
          {summary.has_ai && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              AI
            </span>
          )}
        </div>
        <ConnectionLogoStack providers={summary.connections_needed} />
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border">
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          {program.public_author_name && (
            <p>by {program.public_author_name}</p>
          )}
          <p className="flex items-center gap-1">
            <UseIcon className="w-3 h-3" />
            {program.fork_count} use{program.fork_count !== 1 ? "s" : ""}
          </p>
        </div>

        {forkedId ? (
          <Button asChild size="sm" variant="outline" className="text-xs h-7">
            <Link href={`/programs/${forkedId}`}>Open program</Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={() => onFork(program.id)}
            disabled={forking}
          >
            {forking ? "Using..." : "Use now"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ConnectionLogoStack({ providers }: { providers: string[] }) {
  const normalized = [...new Set(providers.map(normalizeProvider).filter(Boolean))];
  if (normalized.length === 0) return null;

  const label = normalized.map((provider) => PROVIDER_LABELS[provider] ?? provider).join(", ");

  return (
    <div className="flex shrink-0 -space-x-2" aria-label={`Connections: ${label}`} title={label}>
      {normalized.map((provider) => (
        <ProviderLogo key={provider} provider={provider} />
      ))}
    </div>
  );
}

function ProviderLogo({ provider }: { provider: string }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = PROVIDER_ICON_URL[provider];
  const label = PROVIDER_LABELS[provider] ?? provider;

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-background shadow-sm">
      {iconUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={label}
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] font-bold uppercase text-muted-foreground">
          {label.slice(0, 2)}
        </span>
      )}
    </span>
  );
}

function normalizeProvider(provider: string): string {
  const key = provider
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/[\s-]+/g, "_");

  return PROVIDER_ALIASES[key] ?? key;
}

function UseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8h9" strokeLinecap="round" />
      <path d="M8.5 4.5 12 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
