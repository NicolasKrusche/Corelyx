"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENTS, type Announcement } from "@/lib/announcements";
import type { AppNotification } from "@/app/api/notifications/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarData = {
  pendingApprovalsCount: number;
  failedRunsCount: number;
  usage: {
    runs: { current: number; total: number | null };
    genesis: { usesThisMonth: number; maxUses: number | null };
    aiCredits: { availableIncluded: number | null; availablePurchased: number; total: number | null } | null;
  };
};

type Alert = {
  id: string;
  kind: "error" | "warning" | "info";
  title: string;
  body: string;
  href: string;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

const DISMISSED_KEY = "corelyx-dismissed-announcements";
const READ_KEY = "corelyx-notifications-read-at";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function dismiss(id: string) {
  try {
    const set = getDismissed();
    set.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

function markRead() {
  try { localStorage.setItem(READ_KEY, Date.now().toString()); } catch { /* noop */ }
}

function getLastRead(): number {
  try { return parseInt(localStorage.getItem(READ_KEY) ?? "0", 10); } catch { return 0; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAlerts(data: SidebarData): Alert[] {
  const alerts: Alert[] = [];

  if (data.failedRunsCount > 0) {
    alerts.push({
      id: "failed-runs",
      kind: "error",
      title: `${data.failedRunsCount} failed run${data.failedRunsCount === 1 ? "" : "s"}`,
      body: "Click to view and retry failed executions.",
      href: "/runs",
    });
  }

  if (data.pendingApprovalsCount > 0) {
    alerts.push({
      id: "pending-approvals",
      kind: "warning",
      title: `${data.pendingApprovalsCount} approval${data.pendingApprovalsCount === 1 ? "" : "s"} waiting`,
      body: "Workflow runs are paused until you respond.",
      href: "/approvals",
    });
  }

  if (data.usage.aiCredits) {
    const { total, availableIncluded } = data.usage.aiCredits;
    if (total !== null && total !== Infinity && availableIncluded !== null) {
      const pct = total > 0 ? (availableIncluded / total) * 100 : 0;
      if (pct < 20 && pct > 0) {
        alerts.push({
          id: "credits-low",
          kind: "warning",
          title: "Credits running low",
          body: `${Math.round(pct)}% of your included credits remain this month.`,
          href: "/credits",
        });
      } else if (pct <= 0) {
        alerts.push({
          id: "credits-empty",
          kind: "error",
          title: "Included credits exhausted",
          body: "Top up to keep workflows running without interruption.",
          href: "/credits",
        });
      }
    }
  }

  if (data.usage.genesis.maxUses !== null) {
    const left = data.usage.genesis.maxUses - data.usage.genesis.usesThisMonth;
    if (left <= 0) {
      alerts.push({
        id: "genesis-limit",
        kind: "warning",
        title: "Genesis limit reached",
        body: "You've used all Genesis AI calls for this month.",
        href: "/credits",
      });
    }
  }

  return alerts;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

const ACCENT: Record<Announcement["type"], string> = {
  release:     "border-primary bg-primary/5 [&_[data-badge]]:bg-primary [&_[data-badge]]:text-primary-foreground",
  feature:     "border-blue-500/40 bg-blue-500/5 [&_[data-badge]]:bg-blue-500 [&_[data-badge]]:text-white",
  update:      "border-violet-500/40 bg-violet-500/5 [&_[data-badge]]:bg-violet-500 [&_[data-badge]]:text-white",
  info:        "border-border bg-card [&_[data-badge]]:bg-muted [&_[data-badge]]:text-foreground",
  maintenance: "border-yellow-500/40 bg-yellow-500/5 [&_[data-badge]]:bg-yellow-500 [&_[data-badge]]:text-black",
};

const ALERT_STYLE: Record<Alert["kind"], string> = {
  error:   "border-destructive/30 bg-destructive/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  info:    "border-border bg-card",
};

const ALERT_DOT: Record<Alert["kind"], string> = {
  error:   "bg-destructive",
  warning: "bg-yellow-500",
  info:    "bg-blue-500",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationCenter({ isDark = true }: { isDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [inboxItems, setInboxItems] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isNew, setIsNew] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Active (non-dismissed) announcements
  const activeAnnouncements = ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id));
  const totalUnread = alerts.length + activeAnnouncements.length + inboxItems.length;

  // Fetch alerts on mount
  const fetchAlerts = useCallback(async () => {
    try {
      const since = localStorage.getItem("runs_last_seen");
      const url = since ? `/api/sidebar-data?since=${since}` : "/api/sidebar-data";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as SidebarData;
      setAlerts(buildAlerts(data));
    } catch { /* noop */ }
  }, []);

  const fetchInboxItems = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: AppNotification[] };
      setInboxItems(data.notifications);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    setDismissed(getDismissed());
    void fetchAlerts();
    void fetchInboxItems();
  }, [fetchAlerts, fetchInboxItems]);

  // Determine if there's anything new since last read
  useEffect(() => {
    const lastRead = getLastRead();
    const hasNewAnnouncement = activeAnnouncements.some(
      (a) => new Date(a.date).getTime() > lastRead
    );
    setIsNew(hasNewAnnouncement || alerts.length > 0 || inboxItems.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length, dismissed, inboxItems.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    if (!open) {
      markRead();
      setIsNew(false);
      void fetchAlerts();
      void fetchInboxItems();
      // Mark in-app notifications as read server-side
      void fetch("/api/notifications", { method: "POST" }).then(() => {
        setInboxItems([]);
      }).catch(() => undefined);
    }
    setOpen((v) => !v);
  }

  function handleDismiss(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dismiss(id);
    setDismissed(getDismissed());
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        type="button"
        title="Notifications"
        onClick={toggle}
        className={cn(
          "relative flex h-8 w-full items-center overflow-hidden rounded-lg text-sm transition-colors",
          isDark
            ? "text-blue-100/80 hover:bg-white/8 hover:text-white"
            : "text-gray-600 hover:bg-black/8 hover:text-gray-900",
          open && (isDark ? "bg-white/8 text-white" : "bg-black/8 text-gray-900")
        )}
      >
        <span className="relative flex h-full w-10 shrink-0 items-center justify-center">
          <BellIcon />
          {totalUnread > 0 && (
            <>
              {isNew && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-ping rounded-full bg-primary opacity-75" />
              )}
              <span className={cn(
                "absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full",
                isNew ? "bg-primary" : "bg-muted-foreground/60"
              )} />
            </>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left opacity-0 transition-opacity duration-150 group-hover/side:opacity-100 group-data-[open]/side:opacity-100">
          Notifications
          {totalUnread > 0 && (
            <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {totalUnread}
            </span>
          )}
        </span>
      </button>

      {/* Panel — floats to the right of the sidebar */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute bottom-0 left-full z-[150] ml-2 w-80 overflow-hidden rounded-2xl border border-border shadow-2xl",
            "bg-popover text-popover-foreground"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {totalUnread > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {totalUnread} unread
              </span>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {/* Inbox */}
            {inboxItems.length > 0 && (
              <section className="px-3 pt-3">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Inbox
                </p>
                <div className="space-y-2">
                  {inboxItems.map((item) => {
                    const inner = (
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>
                        <span className="mt-1 block text-[10px] text-muted-foreground/60">{formatDate(item.created_at)}</span>
                      </span>
                    );
                    const cls = "flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:brightness-95";
                    return item.href ? (
                      <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className={cls}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        {inner}
                      </Link>
                    ) : (
                      <div key={item.id} className={cls}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <section className="px-3 pt-3">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Alerts
                </p>
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <Link
                      key={alert.id}
                      href={alert.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-start gap-3 rounded-xl border p-3 transition-colors hover:brightness-95",
                        ALERT_STYLE[alert.kind]
                      )}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", ALERT_DOT[alert.kind])} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{alert.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{alert.body}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Announcements */}
            {activeAnnouncements.length > 0 && (
              <section className="px-3 pt-3">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  What&apos;s new
                </p>
                <div className="space-y-2">
                  {activeAnnouncements.map((ann) => (
                    <div
                      key={ann.id}
                      className={cn(
                        "relative overflow-hidden rounded-xl border p-3",
                        ACCENT[ann.type],
                        "announcement-shimmer"
                      )}
                    >
                      {/* Shimmer sweep — CSS animation via global styles */}
                      <div className="announcement-shimmer-sweep pointer-events-none absolute inset-0" />

                      <div className="relative flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {ann.badge && (
                              <span data-badge className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                {ann.badge}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">{formatDate(ann.date)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold">{ann.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{ann.body}</p>
                          {ann.link && (
                            <Link
                              href={ann.link}
                              onClick={() => setOpen(false)}
                              className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                            >
                              {ann.linkLabel ?? "Learn more"} →
                            </Link>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDismiss(ann.id, e)}
                          className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground"
                          title="Dismiss"
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {alerts.length === 0 && activeAnnouncements.length === 0 && inboxItems.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="text-3xl">🎉</span>
                <p className="mt-3 text-sm font-medium">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-muted-foreground">No alerts or new announcements.</p>
              </div>
            )}

            <div className="h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2a5 5 0 00-5 5v2.5L2 11h12l-1-1.5V7a5 5 0 00-5-5z"/>
      <path d="M6.5 13a1.5 1.5 0 003 0"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l8 8M12 4l-8 8"/>
    </svg>
  );
}
