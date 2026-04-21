"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAdvancedMode } from "@/lib/advanced-mode";

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-sm transition-colors",
        active
          ? "bg-white/14 text-white font-medium"
          : "text-blue-100/80 hover:bg-white/8 hover:text-white font-normal"
      )}
    >
      {active && (
        <span className="absolute left-0 inset-y-2 w-[2px] rounded-full bg-blue-300" />
      )}
      <span className="shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>
      <span className="max-w-0 flex-1 truncate opacity-0 transition-all duration-200 group-hover/side:max-w-[120px] group-hover/side:opacity-100">{label}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white transition-all duration-200 group-hover/side:translate-x-0">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

type Tier = "free" | "pro" | "builder" | "unlimited";

const TIER_CONFIG: Record<Tier, { label: string; className: string }> = {
  free:      { label: "Free",      className: "bg-white/10 text-blue-100 border-white/15" },
  pro:       { label: "Pro",       className: "bg-violet-500/20 text-violet-100 border-violet-400/30" },
  builder:   { label: "Builder",   className: "bg-blue-500/25 text-blue-100 border-blue-300/30" },
  unlimited: { label: "Unlimited", className: "bg-amber-500/20 text-amber-100 border-amber-300/30" },
};

export function Sidebar({
  isAdmin = false,
  email = "",
  tier = "free",
  planExpiresAt = null,
  isBetaTester = false,
}: {
  isAdmin?: boolean;
  email?: string;
  tier?: Tier;
  planExpiresAt?: string | null;
  isBetaTester?: boolean;
}) {
  const pathname = usePathname();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [failedRuns, setFailedRuns] = useState(0);
  const [advanced] = useAdvancedMode();

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/approvals");
        if (!res.ok) return;
        const data = (await res.json()) as { approvals: unknown[] };
        if (!cancelled) setPendingApprovals(data.approvals?.length ?? 0);
      } catch { /* badge won't show */ }
    }

    void fetchCount();

    const supabase = createBrowserClient();
    const channel = supabase
      .channel("sidebar-approvals")
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => { void fetchCount(); })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (pathname.startsWith("/runs")) {
      localStorage.setItem("runs_last_seen", Date.now().toString());
      setFailedRuns(0);
      return;
    }
    async function fetchFailed() {
      try {
        const lastSeen = localStorage.getItem("runs_last_seen");
        const url = lastSeen ? `/api/runs/failed-count?since=${lastSeen}` : "/api/runs/failed-count";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) setFailedRuns(data.count ?? 0);
      } catch { /* badge won't show */ }
    }
    void fetchFailed();
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <aside className="group/side fixed left-0 top-0 z-40 flex h-full w-16 hover:w-56 flex-col overflow-hidden border-r border-blue-300/10 bg-gradient-to-b from-[#232d60] via-[#212b5d] to-[#1d2656] text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] transition-[width] duration-300 ease-out">
      {/* Logo */}
      <div className="h-14 flex items-center border-b border-white/10 px-4 gap-2.5 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-6 w-6 object-contain shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold tracking-tight text-white opacity-0 transition-all duration-200 group-hover/side:max-w-[120px] group-hover/side:opacity-100">Nexflow</span>
      </div>

      <div className="px-3 pt-3">
        <Link
          href="/programs/new"
          title="Create new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-0 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-400 group-hover/side:px-3"
        >
          <PlusIcon />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/side:max-w-[100px] group-hover/side:opacity-100">Create new</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {/* Dashboard */}
        <NavItem href="/dashboard" label="Home" active={pathname === "/dashboard"}
          icon={<GridIcon />} />

        {/* Group separator */}
        <div className="!my-2 mx-3 h-px bg-white/10" />

        <NavItem href="/programs/new" label="New Program" active={pathname === "/programs/new"}
          icon={<PlusIcon />} />
        <NavItem href="/programs/import" label="Import" active={pathname.startsWith("/programs/import")}
          icon={<ImportIcon />} />
        <NavItem href="/browse" label="Browse" active={pathname.startsWith("/browse")}
          icon={<BrowseIcon />} />
        <NavItem href="/connections" label="Connections" active={pathname.startsWith("/connections")}
          icon={<LinkIcon />} />

        {/* Group separator */}
        <div className="!my-2 mx-3 h-px bg-white/10" />

        <NavItem href="/runs" label="Runs" active={pathname.startsWith("/runs")}
          icon={<RunsIcon />} badge={failedRuns} />
        <NavItem href="/approvals" label="Approvals" active={pathname.startsWith("/approvals")}
          icon={<BellIcon />} badge={pendingApprovals} />
        {advanced && (
          <NavItem href="/logs" label="Logs" active={pathname.startsWith("/logs")}
            icon={<LogsIcon />} />
        )}

        {/* Group separator */}
        <div className="!my-2 mx-3 h-px bg-white/10" />

        <NavItem href="/api-keys" label="API Keys" active={pathname.startsWith("/api-keys")}
          icon={<KeyIcon />} />

        {/* Group separator */}
        <div className="!my-2 mx-3 h-px bg-white/10" />

        <NavItem href="/plan" label="Pricing" active={pathname === "/plan"}
          icon={<PricingIcon />} />
        <NavItem href="/profile" label="Profile" active={pathname.startsWith("/profile")}
          icon={<UserIcon />} />
        <NavItem href="/settings" label="Settings" active={pathname.startsWith("/settings")}
          icon={<SettingsIcon />} />

        {isAdmin && (
          <>
            <div className="!my-2 mx-3 h-px bg-white/10" />
            <NavItem href="/admin/codes" label="Code Manager" active={pathname.startsWith("/admin")}
              icon={<AdminIcon />} />
          </>
        )}
      </nav>

      <div className="border-t border-white/10 shrink-0">
        {/* User / tier section */}
        <div className="space-y-2 px-3 py-3">
          {/* Email */}
          <p className="max-h-0 truncate px-1 text-[11px] text-blue-100/70 opacity-0 transition-all duration-200 group-hover/side:max-h-6 group-hover/side:opacity-100">{email}</p>

          {/* Badges row */}
          <div className="max-h-0 flex flex-wrap gap-1.5 overflow-hidden opacity-0 transition-all duration-200 group-hover/side:max-h-24 group-hover/side:opacity-100">
            {/* Tier badge */}
            <span className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border tracking-wide",
              TIER_CONFIG[tier].className
            )}>
              {TIER_CONFIG[tier].label}
            </span>

            {/* Beta badge */}
            {isBetaTester && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border bg-green-500/20 text-green-100 border-green-300/30 tracking-wide">
                Beta
              </span>
            )}

            {/* Dev/Admin badge */}
            {isAdmin && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border bg-blue-500/20 text-blue-100 border-blue-300/30 tracking-wide">
                Dev
              </span>
            )}
          </div>

          <div className="mt-2 max-h-0 overflow-hidden rounded-lg border border-white/10 bg-white/5 px-2.5 py-0 text-[10px] text-blue-100/80 opacity-0 transition-all duration-200 group-hover/side:max-h-20 group-hover/side:py-2 group-hover/side:opacity-100">
            <p className="font-semibold text-blue-100/90">Workspace usage</p>
            <p className="mt-1">Tier: {TIER_CONFIG[tier].label}</p>
          </div>

          {/* Trial expiry warning */}
          {planExpiresAt && (() => {
            const daysLeft = Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / 86400000);
            if (daysLeft > 14) return null;
            return (
              <p className={cn(
                "max-h-0 overflow-hidden px-1 text-[10px] opacity-0 transition-all duration-200 group-hover/side:max-h-6 group-hover/side:opacity-100",
                daysLeft <= 3 ? "text-red-300" : "text-yellow-200"
              )}>
                {daysLeft <= 0 ? "Trial expired" : `Trial ends in ${daysLeft}d`}
              </p>
            );
          })()}

        </div>

        <div className="p-2 border-t border-white/10">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function SignOutButton() {
  async function handleSignOut() {
    const { createBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button
      onClick={handleSignOut}
      title="Sign out"
      className="flex items-center gap-2.5 w-full rounded-md px-3 py-[7px] text-sm text-blue-100/80 hover:bg-white/8 hover:text-white transition-colors"
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center"><LogOutIcon /></span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/side:max-w-[100px] group-hover/side:opacity-100">Sign out</span>
    </button>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
function ImportIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0l4-4m-4 4l-4-4M4 18.5h16" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
function RunsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
    </svg>
  );
}
function BrowseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5 10 10l-1.5 5.5 5.5-1.5 1.5-5.5z" />
    </svg>
  );
}
function AdminIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );
}
function PricingIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function LogsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h5M6 4.5h9l3.75 3.75V18a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 18V6A1.5 1.5 0 016 4.5z" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}
function LogOutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  );
}
