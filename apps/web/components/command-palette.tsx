"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Program = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"/>
    </svg>
  );
}
function WorkspacesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
      <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
    </svg>
  );
}
function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2v8m-3-3l3 3 3-3"/><path d="M3 13h10"/>
    </svg>
  );
}
function BrowseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5"/><path d="M11.5 11.5l2.5 2.5"/>
    </svg>
  );
}
function ConnectionsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="3" cy="8" r="2"/><circle cx="13" cy="3" r="2"/><circle cx="13" cy="13" r="2"/>
      <path d="M5 8h3m2-3.5L8 8l2 3.5"/>
    </svg>
  );
}
function RunsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="5,3 13,8 5,13"/>
    </svg>
  );
}
function ApprovalsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 4.5L6.5 11 3 7.5"/>
    </svg>
  );
}
function LogsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h10M3 8h7M3 12h5"/>
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="7" r="3.5"/><path d="M9.5 7H14M12 5v4"/>
    </svg>
  );
}
function CreditsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6"/><path d="M8 5v6M6 6.5h3a1.5 1.5 0 010 3H6"/>
    </svg>
  );
}
function SupportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6"/><path d="M8 9.5V10m0-5a2 2 0 110 4"/>
    </svg>
  );
}
function PricingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 10l4-8 4 5 2-3 2 6H2z"/>
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"/>
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6"/>
      <path d="M8 2c-1.5 2-2 4-2 6s.5 4 2 6M8 2c1.5 2 2 4 2 6s-.5 4-2 6M2 8h12"/>
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"/>
    </svg>
  );
}
function WorkflowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="5" width="4" height="3" rx="0.75"/>
      <rect x="6" y="2" width="4" height="3" rx="0.75"/>
      <rect x="6" y="11" width="4" height="3" rx="0.75"/>
      <rect x="11" y="5" width="4" height="3" rx="0.75"/>
      <path d="M5 6.5h1M10 3.5h1l1 3-1 3h-1M10 12.5h1"/>
    </svg>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "home",        label: "Home",           href: "/dashboard",      icon: HomeIcon },
  { id: "workspaces",  label: "Workspaces",     href: "/workspaces",     icon: WorkspacesIcon },
  { id: "import",      label: "Import",         href: "/programs/import",icon: ImportIcon },
  { id: "browse",      label: "Browse",         href: "/browse",         icon: BrowseIcon },
  { id: "connections", label: "Connections",    href: "/connections",    icon: ConnectionsIcon },
  { id: "runs",        label: "Runs",           href: "/runs",           icon: RunsIcon },
  { id: "approvals",   label: "Approvals",      href: "/approvals",      icon: ApprovalsIcon },
  { id: "logs",        label: "Logs",           href: "/logs",           icon: LogsIcon },
  { id: "apiKeys",     label: "API Keys",       href: "/api-keys",       icon: KeyIcon },
  { id: "credits",     label: "Credits & Usage",href: "/credits",        icon: CreditsIcon },
  { id: "support",     label: "Support",        href: "/support",        icon: SupportIcon },
  { id: "pricing",     label: "Pricing",        href: "/plan",           icon: PricingIcon },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);

    // Allow sidebar / other components to open palette via custom event
    function onOpen() { setOpen(true); }
    window.addEventListener("corelyx:open-palette", onOpen);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("corelyx:open-palette", onOpen);
    };
  }, []);

  // ── Load programs when palette opens or query changes ─────────────────────
  const fetchPrograms = useCallback((search: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingPrograms(true);
      try {
        const res = await fetch("/api/programs");
        if (!res.ok) return;
        const data = (await res.json()) as Program[];
        const q = search.toLowerCase();
        setPrograms(
          q
            ? data.filter(
                (p) =>
                  p.name.toLowerCase().includes(q) ||
                  (p.description ?? "").toLowerCase().includes(q)
              )
            : data.slice(0, 6)
        );
      } catch {
        // silently fail — programs are supplementary
      } finally {
        setLoadingPrograms(false);
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (open) fetchPrograms(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function close() {
    setOpen(false);
    setQuery("");
  }

  function navigate(href: string) {
    close();
    startTransition(() => { router.push(href); });
  }

  function openSettings(tab = "account") {
    close();
    window.dispatchEvent(new CustomEvent("corelyx:open-settings", { detail: { tab } }));
  }

  async function signOut() {
    close();
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

      {/* Palette */}
      <div className={cn(
        "relative w-full max-w-xl overflow-hidden rounded-2xl border border-border shadow-2xl",
        "bg-popover text-popover-foreground"
      )}>
        <Command
          className="flex flex-col"
          shouldFilter={false}
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
            </svg>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, workflows…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[380px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Navigation */}
            <Command.Group
              heading="Go to"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {NAV_ITEMS.filter((item) =>
                !query || item.label.toLowerCase().includes(query.toLowerCase())
              ).map((item) => (
                <PaletteItem
                  key={item.id}
                  icon={<item.icon />}
                  label={item.label}
                  onSelect={() => navigate(item.href)}
                />
              ))}
            </Command.Group>

            {/* Actions */}
            {(!query || ["settings", "language", "sign out", "logout", "signout"].some((k) => k.includes(query.toLowerCase()))) && (
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {(!query || "settings".includes(query.toLowerCase())) && (
                  <PaletteItem icon={<SettingsIcon />} label="Settings" hint="Account & preferences" onSelect={() => openSettings("account")} />
                )}
                {(!query || "language".includes(query.toLowerCase())) && (
                  <PaletteItem icon={<GlobeIcon />} label="Change language" hint="Translation & locale" onSelect={() => openSettings("language")} />
                )}
                {(!query || ["sign out","logout","signout"].some((k) => k.includes(query.toLowerCase()))) && (
                  <PaletteItem icon={<SignOutIcon />} label="Sign out" onSelect={() => void signOut()} />
                )}
              </Command.Group>
            )}

            {/* Programs */}
            {(programs.length > 0 || loadingPrograms) && (
              <Command.Group
                heading="Workflows"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {loadingPrograms && programs.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
                    Searching workflows…
                  </div>
                ) : (
                  programs.map((p) => (
                    <PaletteItem
                      key={p.id}
                      icon={<WorkflowIcon />}
                      label={p.name}
                      hint={p.description ?? undefined}
                      badge={p.is_active ? "active" : undefined}
                      onSelect={() => navigate(`/programs/${p.id}`)}
                    />
                  ))
                )}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

// ─── Item ─────────────────────────────────────────────────────────────────────

function PaletteItem({
  icon,
  label,
  hint,
  badge,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "transition-colors"
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {hint && (
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      {badge && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {badge}
        </span>
      )}
    </Command.Item>
  );
}
