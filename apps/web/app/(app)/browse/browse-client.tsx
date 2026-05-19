"use client";

import { useCallback, useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, X, TrendingUp, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL_PAGE_SIZE = 15;
const NEXT_PAGE_SIZE = 6;

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
  author_username: string | null;
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
  filterTags,
}: {
  initialPrograms: PublicProgram[];
  initialTotal: number;
  filterTags: string[];
}) {
  const router = useRouter();
  const [programs, setPrograms] = useState<PublicProgram[]>(initialPrograms);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPrograms.length < initialTotal);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [forking, setForking] = useState<string | null>(null);
  const [forked, setForked] = useState<Record<string, string>>({}); // id → new program id
  const [forkError, setForkError] = useState<string | null>(null); // fix: inline error surface for fork failures

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const buildBrowseParams = useCallback((offset: number, limit: number, searchQ = q) => {
    const activeTags = [selectedApp, selectedUseCase].filter(Boolean) as string[];
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });

    if (activeTags.length > 0) params.set("tags", activeTags.join(","));
    if (searchQ.trim()) params.set("q", searchQ.trim());
    if (sort === "popular") params.set("sort", "popular");

    return params;
  }, [q, selectedApp, selectedUseCase, sort]);

  // Only re-fetch when filters are actually set — initial data comes from server
  useEffect(() => {
    const activeTags = [selectedApp, selectedUseCase].filter(Boolean) as string[];

    if (!q && activeTags.length === 0 && sort === "latest") {
      setPrograms(initialPrograms);
      setTotal(initialTotal);
      setHasMore(initialPrograms.length < initialTotal);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    let cancelled = false;

    const doFetch = (searchQ: string) => {
      setLoading(true);
      setLoadingMore(false);
      const params = buildBrowseParams(0, INITIAL_PAGE_SIZE, searchQ);

      fetch(`/api/browse?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load");
          return res.json() as Promise<{ programs: PublicProgram[]; total: number }>;
        })
        .then((data) => {
          if (!cancelled) {
            setPrograms(data.programs);
            setTotal(data.total);
            setHasMore(data.programs.length < data.total);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPrograms([]);
            setHasMore(false);
          }
        })
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
  }, [q, selectedApp, selectedUseCase, sort, initialPrograms, initialTotal, buildBrowseParams]);

  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || selectedProgramId || !hasMore || programs.length >= total) return;

    setLoadingMore(true);
    try {
      const params = buildBrowseParams(programs.length, NEXT_PAGE_SIZE);
      const res = await fetch(`/api/browse?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as { programs: PublicProgram[]; total: number };

      let nextLength = programs.length;
      setPrograms((prev) => {
        const seen = new Set(prev.map((program) => program.id));
        const nextPrograms = data.programs.filter((program) => !seen.has(program.id));
        const next = [...prev, ...nextPrograms];
        nextLength = next.length;
        return next;
      });
      setTotal(data.total);
      setHasMore(nextLength < data.total);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [buildBrowseParams, hasMore, loading, loadingMore, programs.length, selectedProgramId, total]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loading || loadingMore || selectedProgramId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadNextPage();
        }
      },
      { rootMargin: "420px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadNextPage, selectedProgramId]);

  // Keep filter menus compact while still allowing direct program selection.
  const filterPool = [...initialPrograms, ...programs];
  const allTags = [...new Set([...filterTags, ...filterPool.flatMap((p) => p.tags)])].sort();
  const appTags = allTags.filter((tag) => PROVIDER_LABELS[tag]);
  const useCaseTags = allTags.filter((tag) => !PROVIDER_LABELS[tag]);
  const tagCounts = new Map<string, number>();
  for (const program of filterPool) {
    for (const tag of program.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const programOptions = [...new Map(filterPool.map((program) => [program.id, program])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const popularAppTags = [...appTags]
    .sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0))
    .slice(0, 8);
  const selectedProgram = programOptions.find((program) => program.id === selectedProgramId);
  const searchValue = selectedProgram ? selectedProgram.name : q;
  const visiblePrograms = selectedProgramId
    ? programs.filter((program) => program.id === selectedProgramId)
    : programs;
  const isFiltered = Boolean(q || selectedApp || selectedUseCase || selectedProgramId);

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
          {isFiltered
            ? `${visiblePrograms.length} of ${total} program${total !== 1 ? "s" : ""} shown`
            : total > 0
              ? `${total} program${total !== 1 ? "s" : ""} available`
              : "Community-published automation programs"}
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
      <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Find a starting point</p>
            <p className="text-xs text-muted-foreground">
              Search by name, pick an app, or narrow by the job you want done.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setSort("latest")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sort === "latest"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock className="h-3 w-3" />
                Latest
              </button>
              <button
                type="button"
                onClick={() => setSort("popular")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sort === "popular"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Popular
              </button>
            </div>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={() => {
                  setQ("");
                  setSelectedApp(null);
                  setSelectedUseCase(null);
                  setSelectedProgramId("");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              list="browse-program-options"
              placeholder="Search or choose a specific program..."
              value={searchValue}
              className="pl-9 h-10"
              onChange={(e) => {
                const value = e.target.value;
                const exactProgram = programOptions.find(
                  (program) => program.name.toLowerCase() === value.toLowerCase()
                );

                if (exactProgram) {
                  setSelectedProgramId(exactProgram.id);
                  setQ("");
                  setSelectedApp(null);
                  setSelectedUseCase(null);
                  return;
                }

                setSelectedProgramId("");
                setQ(value);
              }}
            />
            <datalist id="browse-program-options">
              {programOptions.map((program) => (
                <option key={program.id} value={program.name} />
              ))}
            </datalist>
          </div>

          <FilterSelect
            value={selectedApp ?? ""}
            placeholder="All apps"
            options={appTags.map((tag) => ({ value: tag, label: PROVIDER_LABELS[tag] ?? tag }))}
            onChange={(v) => { setSelectedApp(v || null); setSelectedProgramId(""); }}
            className="w-full sm:w-48 shrink-0"
            aria-label="Filter by app"
          />

          <FilterSelect
            value={selectedUseCase ?? ""}
            placeholder="All use cases"
            options={useCaseTags.map((tag) => ({ value: tag, label: humanizeTag(tag) }))}
            onChange={(v) => { setSelectedUseCase(v || null); setSelectedProgramId(""); }}
            className="w-full sm:w-52 shrink-0"
            aria-label="Filter by use case"
          />
        </div>

        {popularAppTags.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Popular apps</span>
            {popularAppTags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => {
                  setSelectedApp(selectedApp === tag ? null : tag);
                  setSelectedProgramId("");
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selectedApp === tag
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <ProviderLogo provider={tag} size="sm" />
                <span>{PROVIDER_LABELS[tag] ?? tag}</span>
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
      ) : visiblePrograms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">
            {isFiltered ? "No programs match your filters." : "No programs have been published yet."}
          </p>
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setQ("");
                setSelectedApp(null);
                setSelectedUseCase(null);
                setSelectedProgramId("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePrograms.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                onFork={handleFork}
                forking={forking === program.id}
                forkedId={forked[program.id]}
              />
            ))}
          </div>
          {!selectedProgramId && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {loadingMore ? (
                <span className="text-xs text-muted-foreground">Loading more programs...</span>
              ) : hasMore ? (
                <span className="text-xs text-muted-foreground">Scroll for more</span>
              ) : visiblePrograms.length > 0 ? (
                <span className="text-xs text-muted-foreground">You have reached the end</span>
              ) : null}
            </div>
          )}
        </>
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
            program.author_username ? (
              <p>
                by{" "}
                <Link href={`/u/${program.author_username}`} className="hover:underline">
                  {program.public_author_name}
                </Link>
              </p>
            ) : (
              <p>by {program.public_author_name}</p>
            )
          )}
          <p className="flex items-center gap-1">
            <UseIcon className="w-3 h-3" />
            {formatUseCount(program.fork_count)} users
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

function ProviderLogo({ provider, size = "md" }: { provider: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = PROVIDER_ICON_URL[provider];
  const label = PROVIDER_LABELS[provider] ?? provider;
  const wrapperSize = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const imageSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <span className={`flex ${wrapperSize} shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-background shadow-sm`}>
      {iconUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={label}
          width={20}
          height={20}
          className={`${imageSize} object-contain`}
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

function formatUseCount(count: number): string {
  return `${count}`;
}

function humanizeTag(tag: string): string {
  return tag
    .split(/[-_]/g)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeProvider(provider: string): string {
  const key = provider
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/[\s-]+/g, "_");

  return PROVIDER_ALIASES[key] ?? key;
}

// ─── FilterSelect ─────────────────────────────────────────────────────────────

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;
  const isActive = Boolean(value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
          isActive
            ? "border-primary/50 bg-primary/5 text-foreground"
            : "border-input bg-background text-muted-foreground hover:text-foreground hover:border-border/80"
        }`}
      >
        <span className={`truncate ${isActive ? "font-medium text-foreground" : ""}`}>
          {selectedLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <ul role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
            <li
              role="option"
              aria-selected={value === ""}
              onClick={() => { onChange(""); setOpen(false); }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                value === "" ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className={`mr-auto`}>{placeholder}</span>
              {value === "" && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
            </li>
            {options.length > 0 && <li className="mx-3 my-1 border-t border-border/60" />}
            {options.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                  value === opt.value ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="mr-auto">{opt.label}</span>
                {value === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8h9" strokeLinecap="round" />
      <path d="M8.5 4.5 12 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
