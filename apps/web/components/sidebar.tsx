"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAdvancedMode } from "@/lib/advanced-mode";
import { useTheme, type BaseTheme, type AccentColor } from "@/components/theme-provider";

// ─── Sidebar palette ──────────────────────────────────────────────────────────

interface SidebarPalette {
  from: string; via: string; to: string;
  activeBar: string;
  btnBg: string; btnHover: string;
  badgeBg: string;
}

const SIDEBAR_PALETTE: Record<BaseTheme, Record<AccentColor, SidebarPalette>> = {
  dark: {
    orange: { from: "#1e1006", via: "#190d05", to: "#140a04", activeBar: "#fdba74", btnBg: "#ea580c", btnHover: "#c2410c", badgeBg: "#ea580c" },
    blue:   { from: "#071524", via: "#061220", to: "#050f1c", activeBar: "#93c5fd", btnBg: "#2563eb", btnHover: "#1d4ed8", badgeBg: "#2563eb" },
    indigo: { from: "#0c0a22", via: "#09081c", to: "#070616", activeBar: "#a5b4fc", btnBg: "#4f46e5", btnHover: "#4338ca", badgeBg: "#4f46e5" },
    green:  { from: "#061508", via: "#051207", to: "#040f06", activeBar: "#86efac", btnBg: "#16a34a", btnHover: "#15803d", badgeBg: "#16a34a" },
    pink:   { from: "#200710", via: "#1b060d", to: "#16050a", activeBar: "#f9a8d4", btnBg: "#db2777", btnHover: "#be185d", badgeBg: "#db2777" },
    cyan:   { from: "#04151a", via: "#031115", to: "#030e11", activeBar: "#67e8f9", btnBg: "#0891b2", btnHover: "#0e7490", badgeBg: "#0891b2" },
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
      <span className="min-w-0 flex-1 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ backgroundColor: "var(--sb-badge)" }}>
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
  userId = "",
  createdAt = "",
  initialDisplayName = "",
  initialAvatarUrl = "",
  isOAuthUser = false,
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
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [failedRuns, setFailedRuns] = useState(0);
  const [advanced, setAdvanced] = useAdvancedMode();
  const { base, accent, setBase, setAccent } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    if (searchParams.get("settings") === "1") {
      setMenuOpen(false);
      setSettingsOpen(true);
    }
  }, [searchParams]);

  function handleCloseSettings() {
    setSettingsOpen(false);
    if (!searchParams.has("settings")) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("settings");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  return (
    <aside
      className={cn(
        "group/side fixed left-0 top-0 z-40 flex h-full w-16 hover:w-56 flex-col overflow-hidden border-r transition-[width] duration-300 ease-out",
        isDark ? "text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]" : "text-gray-900",
        borderCls
      )}
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
          <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-6 w-6 object-contain" />
        </span>
        <span className={cn(
          "whitespace-nowrap text-sm font-bold tracking-tight opacity-0 transition-opacity duration-150 group-hover/side:opacity-100",
          isDark ? "text-white" : "text-gray-900"
        )}>Nexflow</span>
      </div>

      <div className="px-3 pt-3">
        <Link
          href="/programs/new"
          title="Create new"
          className="flex h-10 w-full items-center overflow-hidden rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: palette.btnBg }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = palette.btnHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = palette.btnBg; }}
        >
          <span className="flex h-full w-10 shrink-0 items-center justify-center"><PlusIcon /></span>
          <span className="min-w-0 truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">Create new</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {/* Dashboard */}
        <NavItem href="/dashboard" label="Home" active={pathname === "/dashboard"}
          icon={<GridIcon />} isDark={isDark} />

        {/* Group separator */}
        <div className={cn("!my-2 mx-3 h-px", separatorCls)} />

        <NavItem href="/programs/new" label="New Program" active={pathname === "/programs/new"}
          icon={<PlusIcon />} isDark={isDark} />
        <NavItem href="/programs/import" label="Import" active={pathname.startsWith("/programs/import")}
          icon={<ImportIcon />} isDark={isDark} />
        <NavItem href="/browse" label="Browse" active={pathname.startsWith("/browse")}
          icon={<BrowseIcon />} isDark={isDark} />
        <NavItem href="/connections" label="Connections" active={pathname.startsWith("/connections")}
          icon={<LinkIcon />} isDark={isDark} />

        {/* Group separator */}
        <div className={cn("!my-2 mx-3 h-px", separatorCls)} />

        <NavItem href="/runs" label="Runs" active={pathname.startsWith("/runs")}
          icon={<RunsIcon />} badge={failedRuns} isDark={isDark} />
        <NavItem href="/approvals" label="Approvals" active={pathname.startsWith("/approvals")}
          icon={<BellIcon />} badge={pendingApprovals} isDark={isDark} />
        {advanced && (
          <NavItem href="/logs" label="Logs" active={pathname.startsWith("/logs")}
            icon={<LogsIcon />} isDark={isDark} />
        )}

        {/* Group separator */}
        <div className={cn("!my-2 mx-3 h-px", separatorCls)} />

        <NavItem href="/api-keys" label="API Keys" active={pathname.startsWith("/api-keys")}
          icon={<KeyIcon />} isDark={isDark} />

        {/* Group separator */}
        <div className={cn("!my-2 mx-3 h-px", separatorCls)} />

        <NavItem href="/plan" label="Pricing" active={pathname === "/plan"}
          icon={<PricingIcon />} isDark={isDark} />

        {isAdmin && (
          <>
            <div className={cn("!my-2 mx-3 h-px", separatorCls)} />
            <NavItem href="/admin/codes" label="Code Manager" active={pathname.startsWith("/admin")}
              icon={<AdminIcon />} isDark={isDark} />
          </>
        )}
      </nav>

      <div className={cn("border-t shrink-0 px-2 py-2.5", footerBorderCls)}>
        <div className="max-h-0 overflow-hidden opacity-0 pointer-events-none transition-all duration-200 group-hover/side:mb-2 group-hover/side:max-h-[280px] group-hover/side:opacity-100 group-hover/side:pointer-events-auto">
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
                <span>Monthly steps</span>
                <span>0 / 200</span>
              </div>
              <div className={cn("mt-2 h-1.5 rounded-full", isDark ? "bg-blue-200/20" : "bg-black/10")}>
                <div className="h-full w-0 rounded-full" style={{ backgroundColor: palette.btnBg }} />
              </div>
              <p className={cn("mt-2 text-[11px]", isDark ? "text-blue-100/75" : "text-gray-600")}>Resets on May 7</p>
            </div>

            <div className={cn(
              "mt-2 rounded-xl px-3 py-2.5",
              isDark ? "bg-white/5" : "bg-black/5"
            )}>
              <div className="flex items-center justify-between text-[12px] font-medium">
                <span>Monthly AI credits</span>
                <span>0 / 500</span>
              </div>
              <div className={cn("mt-2 h-1.5 rounded-full", isDark ? "bg-blue-200/20" : "bg-black/10")}>
                <div className="h-full w-0 rounded-full" style={{ backgroundColor: "#9f7aea" }} />
              </div>
              <p className={cn("mt-2 text-[11px]", isDark ? "text-blue-100/75" : "text-gray-600")}>Resets on May 7</p>
            </div>
          </div>
        </div>

        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div className={cn(
              "absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 rounded-xl border p-1.5 shadow-xl",
              isDark ? "border-white/10 bg-white text-gray-900" : "border-black/10 bg-white text-gray-900"
            )}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-black/5"
              >
                <SettingsIcon />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-black/5"
              >
                <LogOutIcon />
                <span>Sign out</span>
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
            <div className="flex h-full w-12 shrink-0 items-center justify-center">
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                isDark ? "border-white/15 bg-white/10 text-blue-100" : "border-black/10 bg-black/5 text-gray-700"
              )}>
                {initials}
              </div>
            </div>
            <div className="min-w-0 flex-1 opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">
              <p className="truncate text-[13px] font-semibold leading-4">{displayName}</p>
              <p
                className={cn(
                  "mt-0.5 max-h-0 overflow-hidden text-[11px] leading-3 opacity-0 transition-all duration-200 group-hover/side:max-h-4 group-hover/side:opacity-100",
                  isDark ? "text-blue-100/70" : "text-gray-600"
                )}
              >
                {tierLabel}
              </p>
            </div>
            <ChevronDownIcon className={cn("mr-3 h-4 w-4 shrink-0 opacity-0 transition-opacity duration-150 group-hover/side:opacity-100", menuOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal
          email={email}
          userId={userId}
          createdAt={createdAt}
          displayName={displayName}
          initialDisplayName={initialDisplayName}
          initialAvatarUrl={initialAvatarUrl}
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
          onClose={handleCloseSettings}
        />
      )}
    </aside>
  );
}

type AccountSettingsSection =
  | "account"
  | "profile"
  | "security"
  | "benefits"
  | "legal"
  | "danger"
  | "general"
  | "advanced";

type AccountSettingsGroup = {
  label: string;
  items: Array<{
    id: AccountSettingsSection;
    label: string;
    caption: string;
    icon: React.ComponentType;
  }>;
};

function SettingsModal({
  email,
  userId,
  createdAt,
  displayName,
  initialDisplayName,
  initialAvatarUrl,
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
  onClose,
}: {
  email: string;
  userId: string;
  createdAt: string;
  displayName: string;
  initialDisplayName: string;
  initialAvatarUrl: string;
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
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AccountSettingsSection>("account");

  const [formDisplayName, setFormDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeStatus, setCodeStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "-";

  const identityName = (formDisplayName.trim() || displayName.trim() || email.trim() || "User");
  const identityInitial = identityName.slice(0, 1).toUpperCase();
  const settingsGroups: AccountSettingsGroup[] = [
    {
      label: "Personal",
      items: [
        { id: "account", label: "Account", caption: "Overview and access", icon: UserIcon },
        { id: "profile", label: "Profile", caption: "Display name and avatar", icon: BrowseIcon },
        { id: "security", label: "Security", caption: "Password and sign-in", icon: KeyIcon },
        { id: "benefits", label: "Benefits", caption: "Codes and plan", icon: PricingIcon },
        { id: "legal", label: "Legal", caption: "Privacy and terms", icon: LogsIcon },
        { id: "danger", label: "Danger zone", caption: "Delete this account", icon: CloseIcon },
      ],
    },
    {
      label: "Workspace",
      items: [
        { id: "general", label: "General", caption: "Theme and preferences", icon: SettingsIcon },
        { id: "advanced", label: "Advanced", caption: "Power-user controls", icon: AdminIcon },
      ],
    },
  ];
  const activeTabMeta = settingsGroups.flatMap((group) => group.items).find((item) => item.id === tab) ?? settingsGroups[0].items[0];

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

    const profiles = supabase.from("profiles") as unknown as {
      upsert: (
        value: { id: string; display_name: string | null; avatar_url: string | null },
        options: { onConflict: string }
      ) => PromiseLike<{ error: { message: string } | null }>;
    };

    const { error } = await profiles.upsert(
      {
        id: user.id,
        display_name: formDisplayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      },
      { onConflict: "id" }
    );

    if (error) {
      setProfileStatus({ type: "error", message: error.message });
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
      setPasswordStatus({ type: "error", message: error.message });
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
      setCodeStatus({ type: "error", message: data.error ?? "Invalid code." });
    } else {
      setCodeStatus({ type: "success", message: `Applied: ${data.benefit}` });
      setCode("");
      router.refresh();
    }

    setCodeLoading(false);
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== "delete my account") return;

    setDeleteLoading(true);
    setDeleteStatus(null);

    const res = await fetch("/api/settings/account", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDeleteStatus({ type: "error", message: body.error ?? "Failed to delete account." });
      setDeleteLoading(false);
      return;
    }

    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/?deleted=1";
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-black/10 bg-black/[0.03]">
          <div className="border-b border-black/10 p-4">
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-lg font-semibold text-white">
                  {identityInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{identityName}</p>
                  <p className="truncate text-xs text-gray-500">{email || "-"}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {settingsGroups.map((group) => (
              <div key={group.label} className="mb-5 last:mb-0">
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
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
                              ? "bg-red-50 text-red-700 shadow-sm ring-1 ring-red-200"
                              : "bg-white text-gray-900 shadow-sm ring-1 ring-black/10"
                            : dangerItem
                              ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                              : "text-gray-600 hover:bg-white/80 hover:text-gray-900"
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
                              active ? (dangerItem ? "text-red-600/80" : "text-gray-500") : dangerItem ? "text-red-500/80" : "text-gray-500"
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

          <div className="border-t border-black/10 p-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-black/5"
            >
              Close settings
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-black/10 bg-gradient-to-br from-black/[0.04] via-white to-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{activeTabMeta.label}</h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">{activeTabMeta.caption}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-500 hover:bg-black/5 hover:text-gray-900" aria-label="Close settings">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {tab === "account" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-xl font-semibold text-white">
                      {identityInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-gray-900">{identityName}</p>
                      <p className="truncate text-sm text-gray-500">{email || "-"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">{tierLabel}</span>
                        {isAdmin && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Admin</span>}
                        {isBetaTester && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Beta</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Account details</p>
                    <div className="mt-4 grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
                      <span className="text-gray-500">Email</span>
                      <span className="break-all font-mono text-xs text-gray-700">{email || "-"}</span>
                      <span className="text-gray-500">User ID</span>
                      <span className="break-all font-mono text-xs text-gray-700">{userId || "-"}</span>
                      <span className="text-gray-500">Joined</span>
                      <span className="font-mono text-xs text-gray-700">{memberSince}</span>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Workspace status</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">{tierLabel}</span>
                      {isAdmin && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Admin</span>}
                      {isBetaTester && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Beta</span>}
                    </div>
                    <div className="mt-5 border-t border-black/10 pt-4">
                      <p className="text-sm font-medium text-gray-900">Skill level</p>
                      <p className="mt-1 text-sm text-gray-700">AI Agent Builder</p>
                      <p className="text-xs text-gray-500">Skill level 0</p>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === "profile" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-xl font-semibold text-white">
                      {identityInitial}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{identityName}</p>
                      <p className="text-sm text-gray-500">Choose how your account appears in the workspace.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Profile</p>
                  <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-600">Display name</label>
                      <input
                        type="text"
                        value={formDisplayName}
                        onChange={(e) => setFormDisplayName(e.target.value)}
                        maxLength={60}
                        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-gray-400"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-600">Avatar URL</label>
                      <input
                        type="text"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-gray-400"
                        placeholder="https://..."
                      />
                    </div>
                    {profileStatus && (
                      <p className={cn("text-xs", profileStatus.type === "success" ? "text-green-600" : "text-red-600")}>{profileStatus.message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
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
                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Password</p>
                    <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-gray-400"
                        placeholder="Current password"
                      />
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-gray-400"
                        placeholder="New password"
                      />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-gray-400"
                        placeholder="Confirm new password"
                      />
                      {passwordStatus && (
                        <p className={cn("text-xs", passwordStatus.type === "success" ? "text-green-600" : "text-red-600")}>{passwordStatus.message}</p>
                      )}
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        {passwordLoading ? "Updating..." : "Update password"}
                      </button>
                    </form>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Password</p>
                    <p className="mt-3 text-sm text-gray-600">
                      You signed in with Google. Password login is not available for your account.
                    </p>
                  </section>
                )}

                <section className="rounded-2xl border border-black/10 bg-black/[0.02] p-5">
                  <p className="text-sm font-medium text-gray-900">Security note</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Use a strong password you do not reuse elsewhere, and rotate it if you suspect it has been exposed.
                  </p>
                </section>
              </div>
            )}

            {tab === "benefits" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Redeem a code</p>
                  <form onSubmit={handleRedeem} className="mt-4 flex gap-2">
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="flex-1 rounded-xl border border-black/10 px-3 py-2.5 text-sm uppercase tracking-wider text-gray-900 outline-none ring-0 focus:border-gray-400"
                      placeholder="ENTER CODE"
                    />
                    <button
                      type="submit"
                      disabled={codeLoading || code.length < 3}
                      className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {codeLoading ? "..." : "Redeem"}
                    </button>
                  </form>
                  {codeStatus && (
                    <p className={cn("mt-2 text-xs", codeStatus.type === "success" ? "text-green-600" : "text-red-600")}>{codeStatus.message}</p>
                  )}
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Plan</p>
                    <p className="mt-3 text-sm text-gray-600">Current plan: {tierLabel}. Compare plans or upgrade anytime.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href="/plan"
                        onClick={onClose}
                        className="inline-flex rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                      >
                        {tier === "free" ? "Upgrade plan" : "Compare plans"}
                      </Link>
                      {tier !== "free" && tier !== "unlimited" && (
                        <a
                          href="/api/billing/portal"
                          className="inline-flex rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-black/5"
                        >
                          Manage subscription
                        </a>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Current access</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">{tierLabel}</span>
                      {isAdmin && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Admin</span>}
                      {isBetaTester && <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-700">Beta</span>}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === "legal" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Legal</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link href="/privacy" onClick={onClose} className="rounded-xl border border-black/10 px-3 py-3 text-sm text-gray-700 transition-colors hover:bg-black/5">
                      Privacy Policy
                    </Link>
                    <Link href="/terms" onClick={onClose} className="rounded-xl border border-black/10 px-3 py-3 text-sm text-gray-700 transition-colors hover:bg-black/5">
                      Terms of Service
                    </Link>
                  </div>
                </section>
              </div>
            )}

            {tab === "danger" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Danger zone</p>
                  <p className="mt-3 text-sm text-gray-700">
                    Delete your account and all associated programs, runs, connections, and credentials. This cannot be undone.
                  </p>
                  <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-red-400"
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
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Theme mode</p>
                  <div className="mt-4 flex gap-2">
                    {(["dark", "light"] as BaseTheme[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onBaseChange(option)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-medium capitalize",
                          base === option ? "border-gray-900 bg-gray-900 text-white" : "border-black/15 text-gray-700 hover:bg-black/5"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Accent</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["orange", "blue", "indigo", "green", "pink", "cyan"] as AccentColor[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onAccentChange(option)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs capitalize",
                          accent === option ? "border-gray-900 bg-gray-900 text-white" : "border-black/15 text-gray-700 hover:bg-black/5"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Advanced mode</p>
                  <label className="mt-4 flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={advanced}
                      onChange={(e) => onAdvancedChange(e.target.checked)}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    <span>Enable advanced mode</span>
                  </label>
                  <p className="mt-3 text-sm text-gray-600">
                    Show extra controls and power-user options throughout the app.
                  </p>
                </section>

                <section className="rounded-2xl border border-black/10 bg-black/[0.02] p-5">
                  <p className="text-sm font-medium text-gray-900">Current status</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {advanced ? "Advanced mode is enabled for this workspace." : "Advanced mode is currently turned off."}
                  </p>
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
  const { createBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
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
