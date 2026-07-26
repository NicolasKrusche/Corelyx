"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  Download,
  KeyRound,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/governance", label: "Dashboard", icon: BarChart3 },
  { href: "/governance/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/governance/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/governance/data-controls", label: "Data Controls", icon: Shield },
  { href: "/governance/access", label: "Access & Credentials", icon: KeyRound },
  { href: "/governance/ai-act", label: "AI Act Checkpoints", icon: Scale },
  { href: "/governance/compliance", label: "AI Act Readiness", icon: ShieldCheck },
  { href: "/governance/exports", label: "Exports", icon: Download },
] as const;

export function GovernanceTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Governance and compliance sections"
      className="flex gap-1 overflow-x-auto rounded-xl border glass-card p-1"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/governance" ? pathname === "/governance" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
