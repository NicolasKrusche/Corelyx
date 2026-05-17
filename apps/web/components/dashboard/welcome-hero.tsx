"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Sparkles, Plug, Key, ArrowRight, X } from "lucide-react";

const DISMISSED_KEY = "corelyx-welcome-dismissed";

export function WelcomeHero() {
  // Start dismissed to avoid SSR flash, reveal after localStorage check
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISSED_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  const paths = [
    {
      href: "/programs/new",
      Icon: Sparkles,
      iconClass: "bg-primary/10 text-primary",
      title: "Create with Genesis",
      body: "Describe your automation — Genesis AI builds the full graph.",
    },
    {
      href: "/connections",
      Icon: Plug,
      iconClass: "bg-blue-500/10 text-blue-500",
      title: "Connect a service",
      body: "Link Gmail, Slack, Notion, Airtable, and 100+ integrations.",
    },
    {
      href: "/api-keys",
      Icon: Key,
      iconClass: "bg-violet-500/10 text-violet-500",
      title: "Add an API key",
      body: "Use your own Anthropic, OpenAI, or OpenRouter key.",
    },
  ] as const;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 sm:p-6">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/5" />
      <div className="pointer-events-none absolute -bottom-8 right-12 h-28 w-28 rounded-full bg-primary/4" />
      {/* Top gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <button
        onClick={dismiss}
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary/60">
        Welcome
      </p>
      <h2 className="text-lg font-black tracking-tight">
        Let&apos;s build your first agent
      </h2>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">
        Corelyx lets you automate anything — connect your tools, describe what you want, and let AI handle the rest.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {paths.map(({ href, Icon, iconClass, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card/80 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-sm"
          >
            <div
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconClass} transition-transform group-hover:scale-110`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">{body}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </section>
  );
}
