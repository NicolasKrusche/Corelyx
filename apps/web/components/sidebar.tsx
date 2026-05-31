"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CREDIT_PACKS, formatCredits } from "@/lib/credit-packs";
import { createBrowserClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/avatar-upload";
import { useAdvancedMode } from "@/lib/advanced-mode";
import { useRawSchemaMode } from "@/lib/raw-schema-mode";
import { friendlyErrorMessage, friendlyResponseMessage } from "@/lib/friendly-errors";
import { useTheme, type BaseTheme, type AccentColor } from "@/components/theme-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsSupportTab } from "@/components/settings-support-tab";
import { NotificationCenter } from "@/components/notification-center";
import { NotificationPreferences } from "@/components/notification-preferences";

// ─── Sidebar palette ──────────────────────────────────────────────────────────

interface SidebarPalette {
  from: string; via: string; to: string;
  activeBar: string;
  btnBg: string; btnHover: string;
  badgeBg: string;
}

const SIDEBAR_PALETTE: Record<BaseTheme, Record<AccentColor, SidebarPalette>> = {
  dark: {
    orange: { from: "#1c1410", via: "#191210", to: "#161010", activeBar: "#fdba74", btnBg: "#ea580c", btnHover: "#c2410c", badgeBg: "#ea580c" },
    blue:   { from: "#101418", via: "#0e1216", to: "#0c1014", activeBar: "#93c5fd", btnBg: "#2563eb", btnHover: "#1d4ed8", badgeBg: "#2563eb" },
    indigo: { from: "#121118", via: "#101016", to: "#0e0e14", activeBar: "#a5b4fc", btnBg: "#4f46e5", btnHover: "#4338ca", badgeBg: "#4f46e5" },
    green:  { from: "#101410", via: "#0e130e", to: "#0c110c", activeBar: "#86efac", btnBg: "#16a34a", btnHover: "#15803d", badgeBg: "#16a34a" },
    pink:   { from: "#181012", via: "#160e10", to: "#140c0f", activeBar: "#f9a8d4", btnBg: "#db2777", btnHover: "#be185d", badgeBg: "#db2777" },
    cyan:   { from: "#0e1416", via: "#0c1214", to: "#0a1012", activeBar: "#67e8f9", btnBg: "#0891b2", btnHover: "#0e7490", badgeBg: "#0891b2" },
  },
  light: {
    orange: { from: "#fff4ea", via: "#ffeedd", to: "#ffe8d0", activeBar: "#ea580c", btnBg: "#ea580c", btnHover: "#c2410c", badgeBg: "#ea580c" },
    blue:   { from: "#eaf4ff", via: "#ddeeff", to: "#d0e8ff", activeBar: "#2563eb", btnBg: "#2563eb", btnHover: "#1d4ed8", badgeBg: "#2563eb" },
    indigo: { from: "#f0eeff", via: "#e8e4ff", to: "#e0daff", activeBar: "#4f46e5", btnBg: "#4f46e5", btnHover: "#4338ca", badgeBg: "#4f46e5" },
    green:  { from: "#eafaf0", via: "#dff6e8", to: "#d4f2e0", activeBar: "#16a34a", btnBg: "#16a34a", btnHover: "#15803d", badgeBg: "#16a34a" },
    pink:   { from: "#fff0f5", via: "#ffe8ef", to: "#ffe0ea", activeBar: "#db2777", btnBg: "#db2777", btnHover: "#be185d", badgeBg: "#db2777" },
    cyan:   { from: "#eafbff", via: "#dcf8ff", to: "#cef5ff", activeBar: "#0891b2", btnBg: "#0891b2", btnHover: "#0e7490", badgeBg: "#0891b2" },
  },
};

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
  isDark = true,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  isDark?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative flex h-8 items-center overflow-hidden rounded-lg text-sm transition-colors",
        active
          ? isDark
            ? "bg-white/14 text-white font-medium"
            : "bg-black/10 text-gray-900 font-medium"
          : isDark
            ? "text-blue-100/80 hover:bg-white/8 hover:text-white font-normal"
            : "text-gray-600 hover:bg-black/8 hover:text-gray-900 font-normal"
      )}
    >
      {active && (
        <span className="absolute left-0 inset-y-2 w-[2px] rounded-full" style={{ backgroundColor: "var(--sb-bar)" }} />
      )}
      <span className="flex h-full w-12 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 [animation-duration:2s]" style={{ backgroundColor: "var(--sb-badge)" }} />
          <span className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ backgroundColor: "var(--sb-badge)" }}>
            {badge > 99 ? "99+" : badge}
          </span>
        </span>
      )}
    </Link>
  );
}

function NavButton({
  label,
  icon,
  onClick,
  isDark = true,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex h-8 w-full items-center overflow-hidden rounded-lg text-sm transition-colors",
        isDark
          ? "text-blue-100/80 hover:bg-white/8 hover:text-white font-normal"
          : "text-gray-600 hover:bg-black/8 hover:text-gray-900 font-normal"
      )}
    >
      <span className="flex h-full w-12 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">{label}</span>
    </button>
  );
}

// ─── Nav section label ────────────────────────────────────────────────────────
// Collapsed: renders as a thin separator (h-px) with a small top gap.
// Expanded:  the separator fades out and the text label slides in.

function NavSectionLabel({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div className="mt-2">
      {/* Separator — visible when collapsed, hidden when expanded */}
      <div
        className={cn(
          "mx-3 h-px transition-opacity duration-150",
          "group-hover/side:opacity-0 group-data-[open]/side:opacity-0",
          isDark ? "bg-white/8" : "bg-black/8"
        )}
      />
      {/* Label — hidden when collapsed, slides in when expanded */}
      <p
        className={cn(
          "mb-0.5 max-h-0 overflow-hidden truncate whitespace-nowrap px-3 text-[9px] font-bold uppercase tracking-widest opacity-0",
          "transition-[max-height,opacity] duration-150",
          "group-hover/side:max-h-5 group-hover/side:opacity-100 group-data-[open]/side:max-h-5 group-data-[open]/side:opacity-100",
          isDark ? "text-blue-100/30" : "text-gray-400"
        )}
      >
        {label}
      </p>
    </div>
  );
}

// ─── Nav sub-item (indented child under a section) ────────────────────────────

function NavSubItem({
  href,
  label,
  active,
  isDark = true,
}: {
  href: string;
  label: string;
  active: boolean;
  isDark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center overflow-hidden rounded-lg text-xs transition-colors",
        active
          ? isDark
            ? "bg-white/10 text-white font-medium"
            : "bg-black/8 text-gray-900 font-medium"
          : isDark
            ? "text-blue-100/55 hover:bg-white/6 hover:text-white/75"
            : "text-gray-500 hover:bg-black/6 hover:text-gray-700"
      )}
    >
      <span className="flex w-12 shrink-0 items-center justify-center">
        <span className={cn("text-[10px]", isDark ? "text-blue-100/25" : "text-gray-300")}>–</span>
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
        {label}
      </span>
    </Link>
  );
}

// ─── AI Credits purchase panel ────────────────────────────────────────────────

function AiCreditsPurchasePanel({
  panelClass,
  neutralBtnClass,
  aiCreditsAvailable,
  aiCreditsPurchased,
}: {
  panelClass: string;
  neutralBtnClass: string;
  aiCreditsAvailable: number | null;
  aiCreditsPurchased: number;
}) {
  const [buying, setBuying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(amount: number) {
    setBuying(amount);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_credits: amount }),
      });
      if (!res.ok) { setError("We could not open checkout. Please try again."); return; }
      const { url } = await res.json() as { url: string };
      if (url) window.location.href = url;
    } finally {
      setBuying(null);
    }
  }

  return (
    <section className={panelClass}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Platform AI Credits</p>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Available</span>
          <span className="font-medium text-foreground">
            {aiCreditsAvailable === null ? "Unlimited" : `${formatCredits(aiCreditsAvailable)} credits`}
          </span>
        </div>
        {aiCreditsPurchased > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span>Purchased (never expires)</span>
            <span>{formatCredits(aiCreditsPurchased)}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Credits are used when your workflows call LLMs via the platform key. Included credits reset monthly with your plan.
      </p>
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Top up</p>
        <div className="flex flex-wrap gap-2">
          {CREDIT_PACKS.map(({ credits, priceUsd }) => (
            <button
              key={credits}
              type="button"
              disabled={buying !== null}
              onClick={() => { void handleBuy(credits); }}
              className={cn(neutralBtnClass, "text-xs disabled:opacity-40")}
            >
              {buying === credits ? "..." : `${formatCredits(credits)} / $${priceUsd}`}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}

// ─── Sidebar inline credit top-up ─────────────────────────────────────────────

function SidebarCreditTopUp({ isDark, onSuccess }: { isDark: boolean; onSuccess: () => void }) {
  const [buying, setBuying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(amount: number) {
    setBuying(amount);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_credits: amount }),
      });
      if (!res.ok) { setError("Checkout failed."); return; }
      const { url } = await res.json() as { url: string };
      if (url) window.location.href = url;
      else { onSuccess(); }
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="mt-2">
      <p className={cn("mb-1.5 text-[11px]", isDark ? "text-blue-100/60" : "text-gray-500")}>Top up</p>
      <div className="flex flex-wrap gap-1.5">
        {CREDIT_PACKS.map(({ credits, priceUsd }) => (
          <button
            key={credits}
            type="button"
            disabled={buying !== null}
            onClick={() => { void handleBuy(credits); }}
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40",
              isDark
                ? "bg-white/10 text-blue-100 hover:bg-white/20"
                : "bg-black/8 text-gray-800 hover:bg-black/15",
            )}
          >
            {buying === credits ? "..." : `${formatCredits(credits)} / $${priceUsd}`}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

type Tier = "free" | "plus" | "pro" | "builder" | "unlimited";
type SidebarWorkspace = {
  id: string;
  name: string;
  role: string;
};

const TIER_CONFIG: Record<Tier, { label: string; className: string }> = {
  free:      { label: "Free",      className: "bg-white/10 text-blue-100 border-white/15" },
  plus:      { label: "Solo",      className: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30" },
  pro:       { label: "Team",      className: "bg-violet-500/20 text-violet-100 border-violet-400/30" },
  builder:   { label: "Scale",     className: "bg-blue-500/25 text-blue-100 border-blue-300/30" },
  unlimited: { label: "Unlimited", className: "bg-amber-500/20 text-amber-100 border-amber-300/30" },
};

export function Sidebar({
  isAdmin = false,
  email = "",
  tier = "free",
  planExpiresAt = null,
  isBetaTester = false,
  userId = "",
  createdAt = "",
  initialDisplayName = "",
  initialAvatarUrl = "",
  isOAuthUser = false,
  initialUsername = "",
  skillXp = 0,
}: {
  isAdmin?: boolean;
  email?: string;
  tier?: Tier;
  planExpiresAt?: string | null;
  isBetaTester?: boolean;
  userId?: string;
  createdAt?: string;
  initialDisplayName?: string;
  initialAvatarUrl?: string;
  isOAuthUser?: boolean;
  initialUsername?: string;
  skillXp?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tNav = useTranslations("nav");
  const tMenu = useTranslations("userMenu");
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [failedRuns, setFailedRuns] = useState(0);
  const [runUsageCurrent, setRunUsageCurrent] = useState(0);
  const [runUsageTotal, setRunUsageTotal] = useState<number | null>(null);
  const [genesisUsageCurrent, setGenesisUsageCurrent] = useState(0);
  const [genesisUsageTotal, setGenesisUsageTotal] = useState<number | null>(null);
  const [aiCreditsAvailable, setAiCreditsAvailable] = useState<number | null>(null);
  const [aiCreditsPurchased, setAiCreditsPurchased] = useState(0);
  const [advanced, setAdvanced] = useAdvancedMode();
  const { base, accent, setBase, setAccent } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  // Collapse workspace usage when the mobile sidebar closes
  useEffect(() => {
    if (!mobileOpen) setUsageOpen(false);
  }, [mobileOpen]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<AccountSettingsSection>("account");
  const [activeLang, setActiveLang] = useState<string>("en");
  const [workspaces, setWorkspaces] = useState<SidebarWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRequestRef = useRef<AbortController | null>(null);

  const palette = SIDEBAR_PALETTE[base][accent];
  const isDark = base === "dark";
  const separatorCls = isDark ? "bg-white/10" : "bg-black/10";
  const borderCls = isDark ? "border-blue-300/10" : "border-black/10";
  const footerBorderCls = isDark ? "border-white/10" : "border-black/10";

  const displayName = useMemo(() => {
    if (initialDisplayName.trim()) return initialDisplayName.trim();
    const local = email.split("@")[0]?.trim();
    return local || "Workspace";
  }, [email, initialDisplayName]);

  const tierLabel = TIER_CONFIG[tier].label;
  const initials = displayName.slice(0, 1).toUpperCase();
  const runUsageRatio = runUsageTotal ? runUsageCurrent / runUsageTotal : 0;
  const runUsagePercent = runUsageTotal ? Math.min(100, Math.round(runUsageRatio * 100)) : 0;
  const runWarningAt80 = runUsageTotal !== null && runUsageRatio >= 0.8 && runUsageRatio < 1;
  const runLimitReached = runUsageTotal !== null && runUsageRatio >= 1;
  const genesisUsageRatio = genesisUsageTotal ? genesisUsageCurrent / genesisUsageTotal : 0;
  const genesisUsagePercent = genesisUsageTotal ? Math.min(100, Math.round(genesisUsageRatio * 100)) : 0;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  type SidebarData = {
    pendingApprovalsCount: number;
    failedRunsCount: number;
    activeWorkspaceId: string | null;
    workspaces: SidebarWorkspace[];
    usage: {
      runs: { current: number; total: number | null };
      genesis: { usesThisMonth: number; maxUses: number | null };
      aiCredits: {
        availableIncluded: number | null;
        availablePurchased: number;
        total: number | null;
      } | null;
    };
  };

  const fetchSidebarData = useCallback(async () => {
    const controller = new AbortController();
    sidebarRequestRef.current?.abort();
    sidebarRequestRef.current = controller;
    try {
      const since = localStorage.getItem("runs_last_seen");
      const url = since ? `/api/sidebar-data?since=${since}` : "/api/sidebar-data";
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return;
      const data = (await res.json()) as SidebarData;
      if (controller.signal.aborted) return;
      setPendingApprovals(data.pendingApprovalsCount);
      setFailedRuns(data.failedRunsCount);
      setWorkspaces(data.workspaces);
      setActiveWorkspaceId(data.activeWorkspaceId);
      setRunUsageCurrent(data.usage.runs.current);
      setRunUsageTotal(data.usage.runs.total);
      setGenesisUsageCurrent(data.usage.genesis.usesThisMonth);
      setGenesisUsageTotal(data.usage.genesis.maxUses);
      if (data.usage.aiCredits) {
        setAiCreditsAvailable(data.usage.aiCredits.total);
        setAiCreditsPurchased(data.usage.aiCredits.availablePurchased);
      }
    } catch {
      // Keep existing values when a refresh is replaced or the network fails.
    } finally {
      if (sidebarRequestRef.current === controller) sidebarRequestRef.current = null;
    }
  }, []);

  // Single fetch on mount + realtime subscription scoped to this user's approvals
  useEffect(() => {
    void fetchSidebarData();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("sidebar-approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals", filter: `user_id=eq.${userId}` },
        () => { void fetchSidebarData(); },
      )
      .subscribe();

    // Also listen for a direct browser event fired by the seed button and
    // approval card — this handles UPDATE events that realtime may miss
    // (approvals table doesn't have REPLICA IDENTITY FULL).
    const onApprovalChanged = () => { void fetchSidebarData(); };
    window.addEventListener("approval-changed", onApprovalChanged);

    return () => {
      sidebarRequestRef.current?.abort();
      supabase.removeChannel(channel);
      window.removeEventListener("approval-changed", onApprovalChanged);
    };
  }, [fetchSidebarData, userId]);

  // Clear failed-run badge locally when visiting /runs — no network call needed
  useEffect(() => {
    if (pathname.startsWith("/runs")) {
      localStorage.setItem("runs_last_seen", Date.now().toString());
      setFailedRuns(0);
    }
  }, [pathname]);

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId || switchingWorkspace) return;
    setSwitchingWorkspace(true);
    setWorkspaceMenuOpen(false);
    setWorkspaceSwitchError(null);
    sidebarRequestRef.current?.abort();
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "switch", workspace_id: workspaceId }),
      });
      const body = await res.json().catch(() => null) as { active_workspace_id?: string; error?: string } | null;
      if (!res.ok || body?.active_workspace_id !== workspaceId) {
        setWorkspaceSwitchError(body?.error ?? "We could not switch workspaces. Please try again.");
        setWorkspaceMenuOpen(true);
        return;
      }
      setActiveWorkspaceId(workspaceId);
      // Workspace context scopes most server-rendered app data. A full
      // navigation avoids stale sidebar state when switching on the dashboard.
      window.location.replace("/dashboard");
    } catch {
      setWorkspaceSwitchError("We could not connect. Check your internet connection and try again.");
      setWorkspaceMenuOpen(true);
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (localStorage.getItem("corelyx-language") ?? "en") : "en";
    setActiveLang(stored);
    function onStorage(e: StorageEvent) {
      if (e.key === "corelyx-language") setActiveLang(e.newValue ?? "en");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    function onOpenSettings(e: Event) {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab ?? "account";
      setSettingsInitialTab(tab as AccountSettingsSection);
      setSettingsOpen(true);
    }
    window.addEventListener("corelyx:open-settings", onOpenSettings);
    return () => window.removeEventListener("corelyx:open-settings", onOpenSettings);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    }

    if (menuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }

    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!workspaceMenuRef.current) return;
      if (workspaceMenuRef.current.contains(event.target as Node)) return;
      setWorkspaceMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    }

    if (workspaceMenuOpen) {
      window.addEventListener("mousedown", handlePointerDown);
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (searchParams.get("settings") === "1") {
      setMenuOpen(false);
      setSettingsOpen(true);
    }
  }, [searchParams]);

  function handleCloseSettings() {
    setSettingsOpen(false);
    setSettingsInitialTab("account");
    if (!searchParams.has("settings")) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("settings");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        onClick={() => setMobileOpen((v) => !v)}
        className={cn(
          "fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg border transition-colors lg:hidden",
          isDark
            ? "border-white/10 bg-slate-900/80 text-white backdrop-blur"
            : "border-black/10 bg-white/80 text-gray-900 backdrop-blur"
        )}
      >
        {mobileOpen ? <CloseIcon className="h-4 w-4" /> : <MenuIcon />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

    <aside
      data-open={mobileOpen ? "" : undefined}
      className={cn(
        "group/side fixed left-0 top-0 z-40 flex h-full flex-col border-r",
        // Mobile: full width drawer, slides in/out
        "w-56 -translate-x-full overflow-hidden transition-transform duration-300 ease-out",
        mobileOpen && "translate-x-0",
        // Desktop: icon rail that expands on hover
        "lg:w-16 lg:translate-x-0 lg:overflow-visible lg:transition-[width] lg:hover:w-56",
        isDark ? "text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]" : "text-gray-900",
        borderCls
      )}
      onMouseLeave={() => {
        setMenuOpen(false);
        setWorkspaceMenuOpen(false);
      }}
      style={{
        background: `linear-gradient(to bottom, ${palette.from}, ${palette.via}, ${palette.to})`,
        ["--sb-bar" as string]: palette.activeBar,
        ["--sb-badge" as string]: palette.badgeBg,
      }}
    >
      {/* Logo */}
      <div className={cn("flex h-14 shrink-0 items-center overflow-hidden border-b", footerBorderCls)}>
        <span className="flex h-full w-16 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-6 w-6 object-contain" />
        </span>
        <span className={cn(
          "whitespace-nowrap text-sm font-bold tracking-tight opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100",
          isDark ? "text-white" : "text-gray-900"
        )}>Corelyx</span>
      </div>

      <div className="px-3 pt-3">
        <div ref={workspaceMenuRef} className="relative mb-2">
          <button
            type="button"
            aria-label="Active workspace"
            aria-expanded={workspaceMenuOpen}
            disabled={switchingWorkspace}
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
            className={cn(
              "flex h-10 w-full items-center overflow-hidden rounded-lg border text-sm shadow-sm transition-colors",
              isDark
                ? "border-white/10 bg-white/10 text-white hover:bg-white/15"
                : "border-black/10 bg-white/60 text-gray-900 hover:bg-white"
            )}
          >
            <span className="flex h-full w-10 shrink-0 items-center justify-center"><WorkspaceIcon /></span>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-xs font-semibold opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
              {activeWorkspace?.name ?? "Workspace"}
            </span>
            <span className={cn(
              "mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-all duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100",
              workspaceMenuOpen && "rotate-180",
              isDark ? "text-blue-100/80" : "text-gray-500"
            )}>
              <ChevronDownIcon />
            </span>
          </button>

          {workspaceMenuOpen && (
            <div
              className={cn(
                "absolute left-0 top-11 z-50 w-[208px] overflow-hidden rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl",
                isDark
                  ? "border-white/10 bg-slate-950/95 text-white shadow-black/40"
                  : "border-black/10 bg-white/95 text-gray-900 shadow-black/15"
              )}
            >
              <div className={cn("px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest", isDark ? "text-blue-100/50" : "text-gray-500")}>
                Switch workspace
              </div>
              <div className="max-h-60 overflow-y-auto">
                {workspaces.length === 0 ? (
                  <Link
                    href="/workspaces"
                    onClick={() => setWorkspaceMenuOpen(false)}
                    className={cn(
                      "flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      isDark ? "text-blue-100/80 hover:bg-white/8 hover:text-white" : "text-gray-600 hover:bg-black/5 hover:text-gray-950"
                    )}
                  >
                    Create a workspace
                  </Link>
                ) : workspaces.map((workspace) => {
                  const selected = workspace.id === activeWorkspaceId;
                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => { void switchWorkspace(workspace.id); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        selected
                          ? isDark
                            ? "bg-white/14 text-white"
                            : "bg-black/8 text-gray-950"
                          : isDark
                            ? "text-blue-100/80 hover:bg-white/8 hover:text-white"
                            : "text-gray-600 hover:bg-black/5 hover:text-gray-950"
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: selected ? palette.activeBar : "transparent", boxShadow: selected ? `0 0 0 3px ${palette.activeBar}22` : undefined }}
                      />
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] capitalize", isDark ? "bg-white/8 text-blue-100/70" : "bg-black/5 text-gray-500")}>
                        {workspace.role}
                      </span>
                    </button>
                  );
                })}
              </div>
              {workspaceSwitchError && (
                <p className="px-2.5 pb-1 pt-2 text-[11px] text-red-400">{workspaceSwitchError}</p>
              )}
            </div>
          )}
        </div>
        <Link
          href="/programs/new"
          title="Create new"
          className="flex h-10 w-full items-center overflow-hidden rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: palette.btnBg }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = palette.btnHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = palette.btnBg; }}
        >
          <span className="flex h-full w-10 shrink-0 items-center justify-center"><PlusIcon /></span>
          <span className="min-w-0 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">Create new</span>
        </Link>

        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("corelyx:open-palette"))}
          title="Search (⌘K)"
          className={cn(
            "flex h-8 w-full items-center overflow-hidden rounded-lg text-sm transition-colors",
            isDark ? "text-blue-100/50 hover:bg-white/8 hover:text-white/70" : "text-gray-400 hover:bg-black/8 hover:text-gray-600"
          )}
        >
          <span className="flex h-full w-12 shrink-0 items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
            </svg>
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
            <span className="truncate whitespace-nowrap">Search</span>
            <span className={cn(
              "mr-2 flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none",
              isDark ? "border-white/15 text-blue-100/40" : "border-black/15 text-gray-400"
            )}>
              <span>⌘</span><span>K</span>
            </span>
          </span>
        </button>
      </div>

      <nav className="flex-1 px-2 py-1 overflow-y-auto">
        {/* ── MAIN ───────────────────────────────────────────────────────── */}
        <NavSectionLabel label="Main" isDark={isDark} />
        <div className="space-y-0.5">
          <NavItem href="/dashboard" label={tNav("home")} active={pathname === "/dashboard"}
            icon={<GridIcon />} isDark={isDark} />
          <NavItem href="/workspaces" label={tNav("workspaces")} active={pathname.startsWith("/workspaces")}
            icon={<WorkspaceIcon />} isDark={isDark} />
          <NavItem href="/runs" label={tNav("runs")} active={pathname.startsWith("/runs")}
            icon={<RunsIcon />} badge={failedRuns} isDark={isDark} />
          <NavItem href="/approvals" label={tNav("approvals")} active={pathname.startsWith("/approvals")}
            icon={<BellIcon />} badge={pendingApprovals} isDark={isDark} />
        </div>

        {/* ── DATA ───────────────────────────────────────────────────────── */}
        <NavSectionLabel label="Data" isDark={isDark} />
        <div className="space-y-0.5">
          <NavItem href="/browse" label={tNav("browse")} active={pathname.startsWith("/browse")}
            icon={<BrowseIcon />} isDark={isDark} />
          <NavItem href="/connections" label={tNav("connections")} active={pathname.startsWith("/connections")}
            icon={<LinkIcon />} isDark={isDark} />
        </div>

        {/* ── SETTINGS ───────────────────────────────────────────────────── */}
        <NavSectionLabel label="Settings" isDark={isDark} />
        <div className="space-y-0.5">
          <NavButton
            label="Settings"
            icon={<SettingsIcon />}
            onClick={() => setSettingsOpen(true)}
            isDark={isDark}
          />
          {/* Sub-items — only rendered when sidebar is expanded */}
          <div className="max-h-0 overflow-hidden transition-all duration-200 group-hover/side:max-h-60 group-data-[open]/side:max-h-60">
            <div className="space-y-0.5 pb-0.5">
              <NavSubItem href="/api-keys" label={tNav("apiKeys")} active={pathname.startsWith("/api-keys")} isDark={isDark} />
              <NavSubItem href="/env-vars" label={tNav("envVars")} active={pathname.startsWith("/env-vars")} isDark={isDark} />
              <NavSubItem href="/governance" label="Governance" active={pathname.startsWith("/governance")} isDark={isDark} />
              <NavSubItem href="/credits" label="Usage & Billing" active={pathname.startsWith("/credits")} isDark={isDark} />
              {isAdmin && (
                <NavSubItem href="/admin" label={tNav("admin")} active={pathname.startsWith("/admin")} isDark={isDark} />
              )}
            </div>
          </div>
        </div>

        {/* ── HELP ───────────────────────────────────────────────────────── */}
        <NavSectionLabel label="Help" isDark={isDark} />
        <div className="space-y-0.5">
          <NotificationCenter isDark={isDark} />
          <NavItem href="/support" label={tNav("support")} active={pathname.startsWith("/support")}
            icon={<SupportIcon />} isDark={isDark} />
        </div>
      </nav>

      <div className={cn("border-t shrink-0 px-2 py-2.5", footerBorderCls)}>
        <div className={cn("overflow-hidden transition-all duration-200", usageOpen ? "mb-2 max-h-[400px] opacity-100 pointer-events-auto" : "max-h-0 opacity-0 pointer-events-none")}>
          <div className={cn(
            "rounded-2xl border px-3 py-3",
            isDark ? "border-white/10 bg-white/5 text-blue-50" : "border-black/10 bg-black/5 text-gray-900"
          )}>
            <p className={cn("text-[11px] font-semibold", isDark ? "text-blue-100/90" : "text-gray-700")}>Workspace usage</p>

            <div className={cn(
              "mt-2 rounded-xl px-3 py-2.5",
              isDark ? "bg-white/5" : "bg-black/5"
            )}>
              <div className="flex items-center justify-between text-[12px] font-medium">
                <span>Monthly runs</span>
                <span>{runUsageTotal === null ? "Unlimited" : `${runUsageCurrent} / ${runUsageTotal}`}</span>
              </div>
              <div className={cn("mt-2 h-1.5 rounded-full", isDark ? "bg-blue-200/20" : "bg-black/10")}>
                <div
                  className={cn(
                    "h-full rounded-full",
                    runLimitReached ? "bg-destructive" : runWarningAt80 ? "bg-yellow-500" : ""
                  )}
                  style={{
                    width: runUsageTotal === null ? "100%" : `${runUsagePercent}%`,
                    backgroundColor: runLimitReached || runWarningAt80 ? undefined : palette.btnBg,
                  }}
                />
              </div>
              <p className={cn("mt-2 text-[11px]", isDark ? "text-blue-100/75" : "text-gray-600")}>
                {runLimitReached ? "Run limit reached this month" : runWarningAt80 ? "Warning: 80% of run quota used" : "Resets monthly"}
              </p>
            </div>

            <div className={cn(
              "mt-2 rounded-xl px-3 py-2.5",
              isDark ? "bg-white/5" : "bg-black/5"
            )}>
              <div className="flex items-center justify-between text-[12px] font-medium">
                <span>Monthly AI credits</span>
                <span>{genesisUsageTotal === null ? "Unlimited" : `${genesisUsageCurrent} / ${genesisUsageTotal}`}</span>
              </div>
              <div className={cn("mt-2 h-1.5 rounded-full", isDark ? "bg-blue-200/20" : "bg-black/10")}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: genesisUsageTotal === null ? "100%" : `${genesisUsagePercent}%`,
                    backgroundColor: "hsl(var(--primary))",
                  }}
                />
              </div>
              <p className={cn("mt-2 text-[11px]", isDark ? "text-blue-100/75" : "text-gray-600")}>Resets monthly</p>
            </div>

            <div className={cn(
              "mt-2 rounded-xl px-3 py-2.5",
              isDark ? "bg-white/5" : "bg-black/5"
            )}>
              <div className="flex items-center justify-between text-[12px] font-medium">
                <span>Platform AI credits</span>
                <span>{aiCreditsAvailable === null ? "Unlimited" : formatCredits(aiCreditsAvailable ?? 0)}</span>
              </div>
              {aiCreditsPurchased > 0 && (
                <p className={cn("mt-0.5 text-[11px]", isDark ? "text-blue-100/60" : "text-gray-500")}>
                  +{formatCredits(aiCreditsPurchased)} purchased (never expires)
                </p>
              )}
              {aiCreditsAvailable !== null && (
                <SidebarCreditTopUp isDark={isDark} onSuccess={fetchSidebarData} />
              )}
            </div>
          </div>
        </div>

        {/* Usage toggle button */}
        <button
          type="button"
          onClick={() => setUsageOpen((v) => !v)}
          title="Workspace usage"
          className={cn(
            "flex h-8 w-full items-center overflow-hidden rounded-lg text-sm transition-colors mb-1",
            isDark
              ? "text-blue-100/60 hover:bg-white/8 hover:text-white/80"
              : "text-gray-500 hover:bg-black/8 hover:text-gray-700",
            usageOpen && (isDark ? "bg-white/8 text-white/80" : "bg-black/8 text-gray-700")
          )}
        >
          <span className="flex h-full w-10 shrink-0 items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M3 20h18M5 20V12M9 20V8M13 20V4M17 20V10" strokeLinecap="round" />
            </svg>
          </span>
          <span className="flex-1 min-w-0 truncate whitespace-nowrap text-left text-[13px] font-medium opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
            Workspace usage
          </span>
          <span className={cn(
            "mr-2 flex-shrink-0 opacity-0 transition-all duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100",
            usageOpen && "rotate-180"
          )}>
            <ChevronDownIcon />
          </span>
        </button>

        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div className={cn(
              "absolute bottom-[calc(100%+8px)] left-0 z-50 min-w-[200px] w-full rounded-xl border p-1.5 shadow-xl",
              "border-border bg-popover text-popover-foreground"
            )}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
              >
                <SettingsIcon />
                <span>{tMenu("settings")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsInitialTab("language");
                  setSettingsOpen(true);
                }}
                className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
              >
                <GlobeIcon />
                <span>{tMenu("language")}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
              >
                <LogOutIcon />
                <span>{tMenu("signOut")}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "flex h-12 w-full items-center overflow-hidden rounded-xl border text-left transition-colors",
              isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-black/10 bg-black/5 hover:bg-black/10"
            )}
          >
            <div className="relative flex h-full w-12 shrink-0 items-center justify-center">
              <div
                className={cn(
                  "relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border text-[11px] font-semibold",
                  isDark ? "border-white/15 bg-white/10 text-blue-100" : "border-black/10 bg-black/5 text-gray-700"
                )}
              >
                <span>{initials}</span>
                {initialAvatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={initialAvatarUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>
              {(runWarningAt80 || runLimitReached) && (
                <span className={cn(
                  "absolute bottom-2 right-1.5 h-2 w-2 rounded-full border",
                  isDark ? "border-[rgba(0,0,0,0.4)]" : "border-white/60",
                  runLimitReached ? "bg-red-500" : "bg-yellow-400"
                )} />
              )}
            </div>
            <div className="min-w-0 flex-1 opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-semibold leading-4">{displayName}</p>
                {activeLang !== "en" && (
                  <span className={cn(
                    "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none",
                    isDark ? "bg-white/10 text-blue-100/70" : "bg-black/8 text-gray-500"
                  )}>
                    {activeLang.split("-")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "mt-0.5 max-h-0 overflow-hidden text-[11px] leading-3 opacity-0 transition-all duration-200 group-hover/side:max-h-4 group-hover/side:opacity-100 group-data-[open]/side:max-h-4 group-data-[open]/side:opacity-100",
                  isDark ? "text-blue-100/70" : "text-gray-600"
                )}
              >
                {tierLabel}
              </p>
            </div>
            <ChevronDownIcon className={cn("mr-3 h-4 w-4 shrink-0 opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100", menuOpen && "rotate-180")} />
          </button>
        </div>
      </div>

    </aside>

      {settingsOpen && (
        <SettingsModal
          email={email}
          userId={userId}
          createdAt={createdAt}
          displayName={displayName}
          initialDisplayName={initialDisplayName}
          initialAvatarUrl={initialAvatarUrl}
          initialUsername={initialUsername}
          skillXp={skillXp}
          tier={tier}
          tierLabel={tierLabel}
          isAdmin={isAdmin}
          isBetaTester={isBetaTester}
          isOAuthUser={isOAuthUser}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          base={base}
          accent={accent}
          onBaseChange={setBase}
          onAccentChange={setAccent}
          aiCreditsAvailable={aiCreditsAvailable}
          aiCreditsPurchased={aiCreditsPurchased}
          activeWorkspaceId={activeWorkspaceId}
          initialTab={settingsInitialTab}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}

type AccountSettingsSection =
  | "account"
  | "profile"
  | "security"
  | "benefits"
  | "support"
  | "legal"
  | "compliance"
  | "language"
  | "danger"
  | "general"
  | "advanced"
  | "codeManager";

type AccountSettingsGroup = {
  label: string;
  items: Array<{
    id: AccountSettingsSection;
    label: string;
    caption: string;
    icon: React.ComponentType;
    hidden?: boolean;
  }>;
};

function SettingsModal({
  email,
  userId,
  createdAt,
  displayName,
  initialDisplayName,
  initialAvatarUrl,
  initialUsername,
  skillXp,
  tier,
  tierLabel,
  isAdmin,
  isBetaTester,
  isOAuthUser,
  advanced,
  onAdvancedChange,
  base,
  accent,
  onBaseChange,
  onAccentChange,
  aiCreditsAvailable,
  aiCreditsPurchased,
  activeWorkspaceId,
  initialTab,
  onClose,
}: {
  email: string;
  userId: string;
  createdAt: string;
  displayName: string;
  initialDisplayName: string;
  initialAvatarUrl: string;
  initialUsername: string;
  skillXp: number;
  tier: Tier;
  tierLabel: string;
  isAdmin: boolean;
  isBetaTester: boolean;
  isOAuthUser: boolean;
  advanced: boolean;
  onAdvancedChange: (next: boolean) => void;
  base: BaseTheme;
  accent: AccentColor;
  onBaseChange: (next: BaseTheme) => void;
  onAccentChange: (next: AccentColor) => void;
  aiCreditsAvailable: number | null;
  aiCreditsPurchased: number;
  activeWorkspaceId: string | null;
  initialTab?: AccountSettingsSection;
  onClose: () => void;
}) {
  const router = useRouter();
  const tSettings = useTranslations("settings");
  const [tab, setTab] = useState<AccountSettingsSection>(initialTab ?? "account");

  const [formDisplayName, setFormDisplayName] = useState(initialDisplayName);
  const [formUsername, setFormUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFileName, setAvatarFileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // XP level for workspace status panel
  const XP_LEVELS = [
    { min: 0,    title: "Newcomer"  },
    { min: 50,   title: "Explorer"  },
    { min: 200,  title: "Builder"   },
    { min: 500,  title: "Automator" },
    { min: 1000, title: "Pro"       },
    { min: 2500, title: "Expert"    },
    { min: 5000, title: "Master"    },
  ] as const;
  const currentLevel = XP_LEVELS.reduce((acc, l) => (skillXp >= l.min ? l : acc), XP_LEVELS[0]);
  const nextLevel = XP_LEVELS[XP_LEVELS.indexOf(currentLevel as typeof XP_LEVELS[number]) + 1] ?? null;
  const xpProgress = nextLevel ? Math.min(1, (skillXp - currentLevel.min) / (nextLevel.min - currentLevel.min)) : 1;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeStatus, setCodeStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [redeemUnlockClicks, setRedeemUnlockClicks] = useState(0);

  const [unsubscribeLoading, setUnsubscribeLoading] = useState(false);
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [dsarType, setDsarType] = useState("access");
  const [dsarDescription, setDsarDescription] = useState("");
  const [dsarLoading, setDsarLoading] = useState(false);
  const [dsarStatus, setDsarStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Raw schema mode toggle (Developer tab)
  const [rawSchemaEnabled, setRawSchemaEnabled] = useRawSchemaMode();

  // Execution defaults (Developer tab)
  const [defaultExecutionMode, setDefaultExecutionMode] = useState<"autonomous" | "supervised" | "manual" | null>(null);
  const [defaultConflictPolicy, setDefaultConflictPolicy] = useState<"queue" | "skip" | "fail" | null>(null);
  const [execDefaultsLoading, setExecDefaultsLoading] = useState(false);
  const [execDefaultsSaving, setExecDefaultsSaving] = useState(false);
  const [execDefaultsStatus, setExecDefaultsStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Personal API tokens (Developer tab)
  type ApiToken = { id: string; name: string; token_prefix: string; last_used_at: string | null; created_at: string };
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<{ id: string; name: string; plaintext: string } | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "advanced" || !activeWorkspaceId) return;
    let cancelled = false;
    setExecDefaultsLoading(true);
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data: { workspaces?: Array<{ id: string; default_execution_mode?: string; default_conflict_policy?: string }> }) => {
        if (cancelled) return;
        const ws = data.workspaces?.find((w) => w.id === activeWorkspaceId);
        if (ws) {
          setDefaultExecutionMode((ws.default_execution_mode as "autonomous" | "supervised" | "manual") ?? "supervised");
          setDefaultConflictPolicy((ws.default_conflict_policy as "queue" | "skip" | "fail") ?? "queue");
        }
      })
      .catch(() => { /* keep defaults null */ })
      .finally(() => { if (!cancelled) setExecDefaultsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, activeWorkspaceId]);

  async function saveExecDefaults(mode?: "autonomous" | "supervised" | "manual", policy?: "queue" | "skip" | "fail") {
    if (!activeWorkspaceId) return;
    setExecDefaultsSaving(true);
    setExecDefaultsStatus(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          workspace_id: activeWorkspaceId,
          ...(mode !== undefined ? { default_execution_mode: mode } : {}),
          ...(policy !== undefined ? { default_conflict_policy: policy } : {}),
        }),
      });
      if (res.ok) {
        setExecDefaultsStatus({ type: "success", message: "Saved." });
        setTimeout(() => setExecDefaultsStatus(null), 2500);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setExecDefaultsStatus({ type: "error", message: friendlyResponseMessage(body, "We could not save that setting. Please try again.") });
      }
    } catch {
      setExecDefaultsStatus({ type: "error", message: "We could not connect. Check your internet connection and try again." });
    } finally {
      setExecDefaultsSaving(false);
    }
  }

  // ── Token helpers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "advanced") return;
    let cancelled = false;
    setTokensLoading(true);
    setTokenError(null);
    fetch("/api/user/tokens")
      .then((r) => r.json())
      .then((data: { tokens?: ApiToken[] }) => {
        if (!cancelled) setApiTokens(data.tokens ?? []);
      })
      .catch(() => { if (!cancelled) setTokenError("We could not load your tokens. Please try again."); })
      .finally(() => { if (!cancelled) setTokensLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setCreatingToken(true);
    setTokenError(null);
    try {
      const res = await fetch("/api/user/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName.trim() }),
      });
      const body = await res.json() as { token?: { id: string; name: string; token_prefix: string; created_at: string; plaintext: string }; error?: string };
      if (!res.ok) {
        setTokenError(friendlyResponseMessage(body, "We could not create the token. Please try again."));
        return;
      }
      if (body.token) {
        setApiTokens((prev) => [{ id: body.token!.id, name: body.token!.name, token_prefix: body.token!.token_prefix, last_used_at: null, created_at: body.token!.created_at }, ...prev]);
        setNewlyCreatedToken({ id: body.token.id, name: body.token.name, plaintext: body.token.plaintext });
        setNewTokenName("");
      }
    } catch {
      setTokenError("We could not connect. Check your internet connection and try again.");
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleRevokeToken(tokenId: string) {
    setRevokingTokenId(tokenId);
    setTokenError(null);
    try {
      const res = await fetch(`/api/user/tokens/${tokenId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setTokenError(friendlyResponseMessage(body, "We could not remove the token. Please try again."));
        return;
      }
      setApiTokens((prev) => prev.filter((t) => t.id !== tokenId));
      if (newlyCreatedToken?.id === tokenId) setNewlyCreatedToken(null);
    } catch {
      setTokenError("We could not connect. Check your internet connection and try again.");
    } finally {
      setRevokingTokenId(null);
    }
  }

  async function copyToken(text: string, tokenId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTokenId(tokenId);
      setTimeout(() => setCopiedTokenId((v) => (v === tokenId ? null : v)), 2000);
    } catch { /* ignore */ }
  }

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "-";

  const identityName = (formDisplayName.trim() || displayName.trim() || email.trim() || "User");
  const identityInitial = identityName.slice(0, 1).toUpperCase();
  const redeemUnlocked = redeemUnlockClicks >= 5;
  const hasPaidSubscription = tier !== "free" && tier !== "unlimited";
  const panelClass = "rounded-2xl border border-border bg-card p-5 shadow-sm";
  const subPanelClass = "rounded-2xl border border-border bg-secondary/35 p-5";
  const fieldClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-0 focus:border-primary";
  const primaryBtnClass = "rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40";
  const neutralBtnClass = "inline-flex rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent";
  const settingsGroups: AccountSettingsGroup[] = [
    {
      label: tSettings("groups.personal"),
      items: [
        { id: "account", label: tSettings("tabs.account.label"), caption: tSettings("tabs.account.caption"), icon: UserIcon },
        { id: "profile", label: tSettings("tabs.profile.label"), caption: tSettings("tabs.profile.caption"), icon: BrowseIcon },
        { id: "security", label: tSettings("tabs.security.label"), caption: tSettings("tabs.security.caption"), icon: KeyIcon },
        { id: "benefits", label: tSettings("tabs.plan.label"), caption: tSettings("tabs.plan.caption"), icon: PricingIcon },
        { id: "support", label: tSettings("tabs.support.label"), caption: tSettings("tabs.support.caption"), icon: SupportIcon },
        { id: "legal", label: tSettings("tabs.legal.label"), caption: tSettings("tabs.legal.caption"), icon: LogsIcon, hidden: true },
        { id: "danger", label: tSettings("tabs.danger.label"), caption: tSettings("tabs.danger.caption"), icon: CloseIcon },
      ],
    },
    {
      label: tSettings("groups.workspace"),
      items: [
        { id: "general", label: tSettings("tabs.general.label"), caption: tSettings("tabs.general.caption"), icon: SettingsIcon },
        { id: "language", label: tSettings("tabs.language.label"), caption: tSettings("tabs.language.caption"), icon: GlobeIcon },
        { id: "advanced", label: tSettings("tabs.advanced.label"), caption: tSettings("tabs.advanced.caption"), icon: AdminIcon },
        { id: "compliance", label: tSettings("tabs.compliance.label"), caption: tSettings("tabs.compliance.caption"), icon: LogsIcon },
        ...(isAdmin ? [{ id: "codeManager" as const, label: tSettings("tabs.codeManager.label"), caption: tSettings("tabs.codeManager.caption"), icon: KeyIcon }] : []),
      ],
    },
  ];
  const activeTabMeta = settingsGroups.flatMap((group) => group.items).find((item) => item.id === tab) ?? settingsGroups[0].items[0];

  async function handleAvatarUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileStatus({ type: "error", message: "Please choose an image file." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileStatus({ type: "error", message: "Image too large. Use a file up to 2MB." });
      return;
    }

    try {
      const { publicUrl, fileName } = await uploadAvatar(file);
      setAvatarUrl(publicUrl);
      setAvatarFileName(fileName);
      setProfileStatus({ type: "success", message: "Image uploaded. Save changes to apply it." });
    } catch (error) {
      setProfileStatus({
        type: "error",
        message: friendlyErrorMessage(error instanceof Error ? error.message : null, "We could not upload the image. Please try again."),
      });
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileStatus(null);

    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfileStatus({ type: "error", message: "Not signed in." });
      setProfileSaving(false);
      return;
    }

    const usernameVal = formUsername.trim().toLowerCase() || null;
    if (usernameVal && !/^[a-zA-Z0-9_]{3,30}$/.test(usernameVal)) {
      setProfileStatus({ type: "error", message: "Usernames can use 3 to 30 letters, numbers, or underscores." });
      setProfileSaving(false);
      return;
    }

    const profiles = supabase.from("profiles") as unknown as {
      upsert: (
        value: { id: string; display_name: string | null; avatar_url: string | null; username: string | null },
        options: { onConflict: string }
      ) => PromiseLike<{ error: { message: string } | null }>;
    };

    const { error } = await profiles.upsert(
      {
        id: user.id,
        display_name: formDisplayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        username: usernameVal,
      },
      { onConflict: "id" }
    );

    if (error) {
      setProfileStatus({ type: "error", message: friendlyErrorMessage(error.message, "We could not save your profile. Please try again.") });
    } else {
      setProfileStatus({ type: "success", message: "Profile saved." });
      router.refresh();
    }
    setProfileSaving(false);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }

    setPasswordLoading(true);
    const supabase = createBrowserClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      setPasswordStatus({ type: "error", message: "Current password is incorrect." });
      setPasswordLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus({ type: "error", message: friendlyErrorMessage(error.message, "We could not update your password. Please try again.") });
    } else {
      setPasswordStatus({ type: "success", message: "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordLoading(false);
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    setCodeStatus(null);
    setCodeLoading(true);

    const res = await fetch("/api/settings/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json() as { benefit?: string; error?: string };

    if (!res.ok) {
      setCodeStatus({ type: "error", message: friendlyResponseMessage(data, "That code did not work. Check it and try again.") });
    } else {
      setCodeStatus({ type: "success", message: `Applied: ${data.benefit}` });
      setCode("");
      router.refresh();
    }

    setCodeLoading(false);
  }

  async function handleUnsubscribe() {
    setUnsubscribeStatus(null);
    setUnsubscribeLoading(true);

    const res = await fetch("/api/billing/unsubscribe", { method: "POST" });
    const body = await res.json().catch(() => ({})) as { unsubscribed?: number; message?: string; error?: string };

    if (!res.ok) {
      setUnsubscribeStatus({ type: "error", message: friendlyResponseMessage(body, "We could not cancel the subscription. Please try again.") });
      setUnsubscribeLoading(false);
      return;
    }

    setUnsubscribeStatus({ type: "success", message: body.message ?? "Subscription cancelled." });
    setUnsubscribeLoading(false);
    router.refresh();
  }

  async function handleDsarSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDsarLoading(true);
    setDsarStatus(null);

    const res = await fetch("/api/user/data-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: dsarType, details: dsarDescription.trim() || undefined }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDsarStatus({ type: "error", message: friendlyResponseMessage(body, "We could not send your request. Please try again.") });
      setDsarLoading(false);
      return;
    }

    const data = await res.json() as { request?: { id?: string; due_at?: string } };
    const dueDate = data.request?.due_at
      ? new Date(data.request.due_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "within 30 days";
    setDsarStatus({
      type: "success",
      message: `Request submitted. Reference ${data.request?.id ?? "created"}. We will respond by ${dueDate}.`,
    });
    setDsarDescription("");
    setDsarType("access");
    setDsarLoading(false);
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== "delete my account") return;

    setDeleteLoading(true);
    setDeleteStatus(null);

    const res = await fetch("/api/settings/account", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDeleteStatus({ type: "error", message: friendlyResponseMessage(body, "We could not delete the account. Please try again.") });
      setDeleteLoading(false);
      return;
    }

    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/?deleted=1";
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-secondary/30">
          <div className="border-b border-border p-4">
            <div className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
                  <span>{identityInitial}</span>
                  {avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{identityName}</p>
                  <p className="truncate text-xs text-muted-foreground">{email || "-"}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {settingsGroups.map((group) => (
              <div key={group.label} className="mb-5 last:mb-0">
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.filter((item) => !item.hidden).map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    const dangerItem = item.id === "danger";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          active
                            ? dangerItem
                              ? base === "dark"
                                ? "bg-red-500/15 text-red-300 shadow-sm ring-1 ring-red-500/35"
                                : "bg-red-50 text-red-700 shadow-sm ring-1 ring-red-200"
                              : "bg-primary/12 text-foreground shadow-sm ring-1 ring-primary/30"
                            : dangerItem
                              ? base === "dark"
                                ? "text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                : "text-red-600 hover:bg-red-50 hover:text-red-700"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <span className="mt-0.5 shrink-0">
                          <Icon />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span
                            className={cn(
                              "block truncate text-xs",
                              active ? (dangerItem ? "text-red-600/80" : "text-muted-foreground") : dangerItem ? "text-red-500/80" : "text-muted-foreground"
                            )}
                          >
                            {item.caption}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Close settings
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border bg-gradient-to-br from-primary/15 via-card to-secondary px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{activeTabMeta.label}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{activeTabMeta.caption}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close settings">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {tab === "account" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
                      <span>{identityInitial}</span>
                      {avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-foreground">{identityName}</p>
                      <p className="truncate text-sm text-muted-foreground">{email || "-"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">{tierLabel}</span>
                        {isAdmin && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Admin</span>}
                        {isBetaTester && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Beta</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Account details</p>
                    <div className="mt-4 grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
                      <span className="text-muted-foreground">Email</span>
                      <span className="break-all font-mono text-xs text-foreground">{email || "-"}</span>
                      <span className="text-muted-foreground">Joined</span>
                      <span className="font-mono text-xs text-foreground">{memberSince}</span>
                    </div>
                  </section>

                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace status</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">{tierLabel}</span>
                      {isAdmin && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Admin</span>}
                      {isBetaTester && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Beta</span>}
                    </div>
                    <div className="mt-5 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">Skill level</p>
                        <p className="text-xs text-muted-foreground">{skillXp} XP</p>
                      </div>
                      <p className="mt-0.5 text-sm text-foreground">{currentLevel.title}</p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.round(xpProgress * 100)}%` }}
                        />
                      </div>
                      {nextLevel && (
                        <p className="mt-1 text-[10px] text-muted-foreground">{nextLevel.min - skillXp} XP to {nextLevel.title}</p>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === "profile" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
                      <span>{identityInitial}</span>
                      {avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{identityName}</p>
                      <p className="text-sm text-muted-foreground">Choose how your account appears in the workspace.</p>
                    </div>
                  </div>
                </section>

                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile</p>
                  <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
                      <input
                        type="text"
                        value={formDisplayName}
                        onChange={(e) => setFormDisplayName(e.target.value)}
                        maxLength={60}
                        className={fieldClass}
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                        <input
                          type="text"
                          value={formUsername}
                          onChange={(e) => setFormUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
                          maxLength={30}
                          className={`${fieldClass} pl-7`}
                          placeholder="yourname"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          corelyx.app/u/{formUsername.trim() || "yourname"}
                        </p>
                        {initialUsername && (
                          <a
                            href={`/u/${initialUsername}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-medium text-primary hover:underline shrink-0"
                          >
                            View profile →
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Profile photo</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={cn(neutralBtnClass, "cursor-pointer")}>
                          Upload image
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              void handleAvatarUpload(e.target.files?.[0] ?? null);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarUrl("");
                              setAvatarFileName("");
                            }}
                            className={neutralBtnClass}
                          >
                            Remove image
                          </button>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {avatarFileName ? `Selected: ${avatarFileName}` : "PNG/JPG up to 2MB"}
                      </p>
                    </div>
                    {profileStatus && (
                      <p className={cn("text-xs", profileStatus.type === "success" ? "text-green-600" : "text-red-600")}>{profileStatus.message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className={primaryBtnClass}
                    >
                      {profileSaving ? "Saving..." : "Save changes"}
                    </button>
                  </form>
                </section>
              </div>
            )}

            {tab === "security" && (
              <div className="space-y-6">
                {!isOAuthUser ? (
                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Password</p>
                    <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className={fieldClass}
                        placeholder="Current password"
                      />
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={fieldClass}
                        placeholder="New password"
                      />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={fieldClass}
                        placeholder="Confirm new password"
                      />
                      {passwordStatus && (
                        <p className={cn("text-xs", passwordStatus.type === "success" ? "text-green-600" : "text-red-600")}>{passwordStatus.message}</p>
                      )}
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className={primaryBtnClass}
                      >
                        {passwordLoading ? "Updating..." : "Update password"}
                      </button>
                    </form>
                  </section>
                ) : (
                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Password</p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      You signed in with Google. Password login is not available for your account.
                    </p>
                  </section>
                )}

                <section className={subPanelClass}>
                  <p className="text-sm font-medium text-foreground">Security note</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use a strong password you do not reuse elsewhere, and rotate it if you suspect it has been exposed.
                  </p>
                </section>
              </div>
            )}

            {tab === "benefits" && (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-2">
                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {tier === "unlimited"
                        ? "Unlimited access — all features are unlocked, no plan limits apply."
                        : `Current plan: ${tierLabel}. Compare plans or upgrade anytime.`}
                    </p>
                    {tier !== "unlimited" && (
                      <>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href="/plan"
                            onClick={onClose}
                            className={cn(primaryBtnClass, "inline-flex")}
                          >
                            {tier === "free" ? "Upgrade plan" : "Compare plans"}
                          </Link>
                          {hasPaidSubscription && (
                            <Link
                              href="/api/billing/portal"
                              className={neutralBtnClass}
                            >
                              Manage subscription
                            </Link>
                          )}
                        </div>
                        {hasPaidSubscription && (
                          <div className="mt-4 border-t border-border pt-4">
                            <button
                              type="button"
                              onClick={() => { void handleUnsubscribe(); }}
                              disabled={unsubscribeLoading}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                            >
                              {unsubscribeLoading ? "Unsubscribing..." : "Unsubscribe"}
                            </button>
                            {unsubscribeStatus && (
                              <p className={cn("mt-2 text-xs", unsubscribeStatus.type === "success" ? "text-green-600" : "text-red-600")}>
                                {unsubscribeStatus.message}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current access</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">{tierLabel}</span>
                      {isAdmin && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Admin</span>}
                      {isBetaTester && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">Beta</span>}
                    </div>
                  </section>
                </div>

                <AiCreditsPurchasePanel panelClass={panelClass} neutralBtnClass={neutralBtnClass} aiCreditsAvailable={aiCreditsAvailable} aiCreditsPurchased={aiCreditsPurchased} />
              </div>
            )}

            {tab === "support" && (
              <SettingsSupportTab
                tier={tier}
                userId={userId}
                panelClass={panelClass}
                fieldClass={fieldClass}
                primaryBtnClass={primaryBtnClass}
                neutralBtnClass={neutralBtnClass}
              />
            )}

            {tab === "legal" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link href="/privacy" onClick={onClose} className="rounded-xl border border-border px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent">
                      Privacy Policy
                    </Link>
                    <Link href="/terms" onClick={onClose} className="rounded-xl border border-border px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent">
                      Terms of Service
                    </Link>
                    <Link href="/subprocessors" onClick={onClose} className="rounded-xl border border-border px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent">
                      Subprocessors
                    </Link>
                  </div>
                </section>

                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Data subject request</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Submit a request under GDPR (Art. 15–22). We will respond within 30 days.
                  </p>
                  <form onSubmit={handleDsarSubmit} className="mt-4 space-y-3">
                    <select
                      value={dsarType}
                      onChange={(e) => setDsarType(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="access">Right of access — get a copy of your data</option>
                      <option value="rectification">Right to rectification — correct inaccurate data</option>
                      <option value="erasure">Right to erasure — delete your data</option>
                      <option value="portability">Right to portability — export your data</option>
                      <option value="objection">Right to object — object to processing</option>
                      <option value="restriction">Right to restriction — limit how we use your data</option>
                      <option value="withdrawal">Withdrawal of consent</option>
                    </select>
                    {dsarType === "erasure" && (
                      <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        Submitting an erasure request opens a reviewed request. Immediate account deletion still requires Danger zone after sign-in verification.
                      </p>
                    )}
                    <textarea
                      value={dsarDescription}
                      onChange={(e) => setDsarDescription(e.target.value)}
                      placeholder="Optional: describe your request in more detail"
                      rows={3}
                      className={cn(fieldClass, "resize-none")}
                    />
                    {dsarStatus && (
                      <p className={cn("text-xs", dsarStatus.type === "success" ? "text-green-600" : "text-red-600")}>{dsarStatus.message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={dsarLoading}
                      className={primaryBtnClass}
                    >
                      {dsarLoading ? "Submitting..." : "Submit request"}
                    </button>
                  </form>
                </section>
              </div>
            )}

            {tab === "danger" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Danger zone</p>
                  <p className="mt-3 text-sm text-foreground">
                    Delete your account and all associated programs, runs, connections, and credentials. This cannot be undone.
                  </p>
                  <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="w-full rounded-xl border border-red-300/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-0 focus:border-red-500"
                      placeholder='Type "delete my account"'
                      autoComplete="off"
                    />
                    {deleteStatus && (
                      <p className={cn("text-xs", deleteStatus.type === "success" ? "text-green-600" : "text-red-600")}>{deleteStatus.message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={deleteLoading || deleteConfirm !== "delete my account"}
                      className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {deleteLoading ? "Deleting..." : "Delete my account"}
                    </button>
                  </form>
                </section>
              </div>
            )}

            {tab === "general" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Theme mode</p>
                  <div className="mt-4 flex gap-2">
                    {(["dark", "light"] as BaseTheme[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onBaseChange(option)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-medium capitalize",
                          base === option ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </section>

                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Accent</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["orange", "blue", "indigo", "green", "pink", "cyan"] as AccentColor[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onAccentChange(option)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs capitalize",
                          accent === option ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </section>

                <NotificationPreferences panelClass={panelClass} />
              </div>
            )}

            {tab === "compliance" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">EU Compliance</p>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Submit GDPR data subject requests, download policies, view audit evidence, and exercise privacy rights from the dedicated compliance page.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href="/account/compliance"
                      onClick={onClose}
                      className={cn(primaryBtnClass, "inline-flex")}
                    >
                      Open EU Compliance Center
                    </Link>
                  </div>
                </section>

                <section className={subPanelClass}>
                  <p className="text-sm font-medium text-foreground">Regulatory reference</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    GDPR rights and deadlines are based on Articles 7 and 15-22, including the standard one-month response period under Article 12.
                  </p>
                  <a
                    href="https://gdpr-info.eu/"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm font-medium text-primary hover:underline underline-offset-2"
                  >
                    Read the GDPR text
                  </a>
                </section>
              </div>
            )}

            {tab === "language" && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Language</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Pick a display language for the entire site, or let us auto-detect your device language on first visit.
                  </p>
                  <div className="mt-4">
                    <LanguageSwitcher />
                  </div>
                </section>
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-5">

                {/* ── Raw schema editor toggle ────────────────────── */}
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Raw schema editor</p>
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Enable in workflow editor</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Adds a <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">{"{ }"}</code> button to the editor toolbar — opens a live JSON panel where you can read and write the raw workflow schema directly.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rawSchemaEnabled}
                      onClick={() => setRawSchemaEnabled(!rawSchemaEnabled)}
                      className={cn(
                        "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 overflow-hidden",
                        rawSchemaEnabled ? "bg-primary" : "bg-muted border border-border"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                          rawSchemaEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </section>

                {/* ── Execution defaults ─────────────────────────── */}
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Execution defaults</p>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    Applied to new workflows in this workspace. Individual workflows can override these.
                  </p>

                  {execDefaultsLoading ? (
                    <p className="mt-4 text-xs text-muted-foreground animate-pulse">Loading…</p>
                  ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {/* Execution mode */}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Execution mode
                        </label>
                        <select
                          value={defaultExecutionMode ?? "supervised"}
                          disabled={execDefaultsSaving}
                          onChange={(e) => {
                            const val = e.target.value as "autonomous" | "supervised" | "manual";
                            setDefaultExecutionMode(val);
                            void saveExecDefaults(val, undefined);
                          }}
                          className={cn(fieldClass, "disabled:opacity-50")}
                        >
                          <option value="autonomous">Autonomous — runs without pausing</option>
                          <option value="supervised">Supervised — pauses at risky steps</option>
                          <option value="manual">Manual — every step needs approval</option>
                        </select>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {defaultExecutionMode === "autonomous" && "Agents run end-to-end with no interruptions."}
                          {defaultExecutionMode === "supervised" && "Agents pause when a step is flagged as high-risk."}
                          {(defaultExecutionMode === "manual" || defaultExecutionMode === null) && "Every node requires human sign-off before proceeding."}
                        </p>
                      </div>

                      {/* Conflict policy */}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Conflict policy
                        </label>
                        <select
                          value={defaultConflictPolicy ?? "queue"}
                          disabled={execDefaultsSaving}
                          onChange={(e) => {
                            const val = e.target.value as "queue" | "skip" | "fail";
                            setDefaultConflictPolicy(val);
                            void saveExecDefaults(undefined, val);
                          }}
                          className={cn(fieldClass, "disabled:opacity-50")}
                        >
                          <option value="queue">Queue — wait for the running execution to finish</option>
                          <option value="skip">Skip — drop the new trigger silently</option>
                          <option value="fail">Fail — reject with an error if already running</option>
                        </select>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {defaultConflictPolicy === "queue" && "Incoming triggers wait in line behind the current run."}
                          {defaultConflictPolicy === "skip" && "Duplicate triggers are silently discarded."}
                          {(defaultConflictPolicy === "fail" || defaultConflictPolicy === null) && "A concurrent trigger immediately errors out."}
                        </p>
                      </div>
                    </div>
                  )}

                  {execDefaultsStatus && (
                    <p className={cn("mt-3 text-xs", execDefaultsStatus.type === "success" ? "text-green-600" : "text-red-600")}>
                      {execDefaultsStatus.message}
                    </p>
                  )}
                </section>

                {/* ── Corelyx API tokens ────────────────────────── */}
                <section className={panelClass}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Corelyx AI Keys</p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Personal API tokens for calling Corelyx from scripts, CI, or external agents.
                        Each token grants full API access as you — treat them like passwords.
                      </p>
                    </div>
                  </div>

                  {tier === "free" ? (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-4">
                      <span className="mt-0.5 text-base leading-none">🔒</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Paid plan required</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                          Personal API tokens are available on paid plans. Upgrade to generate tokens and access the Corelyx API programmatically.
                        </p>
                        <Link
                          href="/plan"
                          onClick={onClose}
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                        >
                          View plans →
                        </Link>
                      </div>
                    </div>
                  ) : (<>

                  {/* One-time plaintext reveal */}
                  {newlyCreatedToken && (
                    <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/[0.07] p-4">
                      <p className="text-xs font-semibold text-green-400 mb-2">Token created — copy it now. This is the only time it will be shown.</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 truncate rounded-lg bg-black/30 border border-white/10 px-3 py-2 font-mono text-[11px] text-green-300 select-all">
                          {newlyCreatedToken.plaintext}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyToken(newlyCreatedToken.plaintext, newlyCreatedToken.id + "-plain")}
                          className="shrink-0 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          {copiedTokenId === newlyCreatedToken.id + "-plain" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewlyCreatedToken(null)}
                        className="mt-2.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2"
                      >
                        I&apos;ve saved it — dismiss
                      </button>
                    </div>
                  )}

                  {/* Existing tokens */}
                  {tokensLoading ? (
                    <p className="mt-4 text-xs text-muted-foreground animate-pulse">Loading tokens…</p>
                  ) : apiTokens.length > 0 ? (
                    <ul className="mt-4 divide-y divide-border rounded-xl border border-border overflow-hidden">
                      {apiTokens.map((token) => (
                        <li key={token.id} className="flex items-center gap-3 bg-secondary/20 px-4 py-3 first:rounded-t-xl last:rounded-b-xl">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{token.name}</p>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {token.token_prefix}
                              {token.last_used_at
                                ? <span className="font-sans not-italic ml-2 opacity-70">· last used {new Date(token.last_used_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                                : <span className="font-sans not-italic ml-2 opacity-50">· never used</span>
                              }
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={revokingTokenId === token.id}
                            onClick={() => void handleRevokeToken(token.id)}
                            className="shrink-0 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                          >
                            {revokingTokenId === token.id ? "Revoking…" : "Revoke"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : !newlyCreatedToken ? (
                    <p className="mt-4 text-xs text-muted-foreground">No tokens yet. Create one below.</p>
                  ) : null}

                  {/* Create new token */}
                  {apiTokens.length < 10 && (
                    <form onSubmit={(e) => void handleCreateToken(e)} className="mt-4 flex gap-2">
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder="Token name, e.g. My CI pipeline"
                        maxLength={80}
                        className={cn(fieldClass, "flex-1 min-w-0")}
                        disabled={creatingToken}
                      />
                      <button
                        type="submit"
                        disabled={creatingToken || !newTokenName.trim()}
                        className={cn(primaryBtnClass, "shrink-0")}
                      >
                        {creatingToken ? "Generating…" : "Generate"}
                      </button>
                    </form>
                  )}
                  {apiTokens.length >= 10 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Maximum of 10 tokens reached. Revoke an existing token to create a new one.
                    </p>
                  )}

                  {tokenError && (
                    <p className="mt-2 text-xs text-red-500">{tokenError}</p>
                  )}
                  </>)}
                </section>

                {/* ── Quick-access links ─────────────────────────── */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick access</p>

                  {/* API Keys */}
                  <Link
                    href="/api-keys"
                    className="flex items-start gap-4 rounded-xl border border-border bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.05] hover:border-white/20 group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-muted-foreground group-hover:text-foreground transition-colors">
                      <KeyIcon />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">API Keys</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Add your own Anthropic, OpenAI, or other LLM provider keys. BYOK — costs go to your account.
                      </p>
                    </div>
                  </Link>

                  {/* Env Vars */}
                  <Link
                    href="/env-vars"
                    className="mt-2 flex items-start gap-4 rounded-xl border border-border bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.05] hover:border-white/20 group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-muted-foreground group-hover:text-foreground transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5 10 12l-3.25 4.5M13.5 16.5h3.75M3.75 21h16.5A1.75 1.75 0 0 0 22 19.25V4.75A1.75 1.75 0 0 0 20.25 3H3.75A1.75 1.75 0 0 0 2 4.75v14.5A1.75 1.75 0 0 0 3.75 21Z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Environment Variables</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Encrypted workspace secrets referenced in any workflow node as <code className="font-mono">$env.NAME</code>.
                      </p>
                    </div>
                  </Link>

                  {/* Logs */}
                  <Link
                    href="/logs"
                    className="mt-2 flex items-start gap-4 rounded-xl border border-border bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.05] hover:border-white/20 group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-muted-foreground group-hover:text-foreground transition-colors">
                      <LogsIcon />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Logs</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Full audit trail of all runs, node executions, approval decisions, and system events.
                      </p>
                    </div>
                  </Link>
                </div>

                {/* Hidden code redemption easter egg */}
                <div className="pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTab("legal")}
                    className="text-xs text-muted-foreground/50 underline underline-offset-2 hover:text-muted-foreground"
                  >
                    Legal and privacy tools
                  </button>
                  <button
                    type="button"
                    onClick={() => setRedeemUnlockClicks((v) => Math.min(5, v + 1))}
                    className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60"
                  >
                    build info
                  </button>
                </div>

                {redeemUnlocked && (
                  <section className={panelClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Code redemption</p>
                    <form onSubmit={handleRedeem} className="mt-4 flex gap-2">
                      <input
                        type="text"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className={cn(fieldClass, "flex-1 uppercase tracking-wider")}
                        placeholder="ENTER CODE"
                      />
                      <button
                        type="submit"
                        disabled={codeLoading || code.length < 3}
                        className={primaryBtnClass}
                      >
                        {codeLoading ? "..." : "Redeem"}
                      </button>
                    </form>
                    {codeStatus && (
                      <p className={cn("mt-2 text-xs", codeStatus.type === "success" ? "text-green-600" : "text-red-600")}>{codeStatus.message}</p>
                    )}
                  </section>
                )}
              </div>
            )}

            {tab === "codeManager" && isAdmin && (
              <div className="space-y-6">
                <section className={panelClass}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin Tools</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Manage redemption codes, admin-only access grants, and GDPR data subject request fulfillment.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href="/admin/codes"
                      onClick={onClose}
                      className={cn(primaryBtnClass, "inline-flex")}
                    >
                      Open Code Manager
                    </Link>
                    <Link
                      href="/admin/dsr"
                      onClick={onClose}
                      className={neutralBtnClass}
                    >
                      Open DSR Queue
                    </Link>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

async function handleSignOut() {
  try {
    const { createBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
  } catch { /* ignore — redirect anyway */ }
  window.location.href = "/login";
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
function EnvVarsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5 10 12l-3.25 4.5M13.5 16.5h3.75M3.75 21h16.5a1.75 1.75 0 0 0 1.75-1.75V4.75A1.75 1.75 0 0 0 20.25 3H3.75A1.75 1.75 0 0 0 2 4.75v14.5A1.75 1.75 0 0 0 3.75 21Z" />
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
function WorkspaceIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25V5.75A1.75 1.75 0 0 1 6.25 4h7.5a1.75 1.75 0 0 1 1.75 1.75v14.5m-11 0h15m-11-12h1.5m-1.5 3.5h1.5m-1.5 3.5h1.5m4-7h1.5m-1.5 3.5h1.5m-1.5 3.5h1.5" />
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
function GovernanceIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75 19.5 6.5v5.6c0 4.45-3.05 7.36-7.5 8.15-4.45-.79-7.5-3.7-7.5-8.15V6.5L12 3.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-5" />
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
function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3 7.5 7.03 7.5 12s2.015 9 4.5 9Zm-9-9h18" />
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
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
function SupportIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

function UpdatesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
    </svg>
  );
}

function CreditsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
