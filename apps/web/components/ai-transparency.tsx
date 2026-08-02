"use client";

import React from "react";
import { Bot, ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type PersistentAiDisclosureProps = {
  title: string;
  message: string;
};

const COLLAPSE_STORAGE_KEY = "corelyx-ai-disclosure-collapsed";

/**
 * Global AI disclosure mounted by the root layout so it remains visible across
 * public, authentication, application, admin, and editor routes.
 *
 * It can never be removed, but it can be collapsed to a compact pill —
 * EU AI Act Art. 50 requires disclosure at first interaction/exposure, not a
 * permanently full-size banner, and the expanded state is the SSR default so
 * every first visit sees the complete message. Collapsing matters on small
 * screens, where the full banner otherwise covers bottom-anchored UI such as
 * the Genesis prompt toolbar on /programs/new.
 */
export function PersistentAiDisclosure({
  title,
  message,
}: PersistentAiDisclosureProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable (private mode) — stay expanded.
    }
  }, []);

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Best effort only.
    }
  };

  return (
    <aside
      role="note"
      aria-labelledby="corelyx-ai-disclosure-title"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex justify-center sm:inset-x-6"
      data-testid="persistent-ai-disclosure"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsedPersisted(false)}
          aria-expanded="false"
          aria-label={`${title}: ${message}`}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-background/95 px-2.5 py-1 shadow-lg shadow-black/10 backdrop-blur transition-colors hover:bg-background supports-[backdrop-filter]:bg-background/90"
        >
          <Bot className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
          <span
            id="corelyx-ai-disclosure-title"
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary"
          >
            {title}
          </span>
        </button>
      ) : (
        <div className="pointer-events-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl border border-primary/35 bg-background/95 px-3 py-2 text-center shadow-lg shadow-black/10 backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:flex-nowrap sm:px-4 sm:text-left">
          <Bot className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span
            id="corelyx-ai-disclosure-title"
            className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-primary"
          >
            {title}
          </span>
          <span className="hidden h-3 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
          <span className="text-[11px] font-medium leading-snug text-foreground/80 sm:text-xs">
            {message}
          </span>
          <button
            type="button"
            onClick={() => setCollapsedPersisted(true)}
            aria-expanded="true"
            aria-label="Collapse AI disclosure"
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
}

/** A compact, explicit identity label for an AI-authored message or surface. */
export function AiIdentityBadge({
  label = "Corelyx AI",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary",
        className
      )}
      aria-label={`${label}, artificial intelligence`}
    >
      <Bot className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Reusable warning shown next to content produced by an AI model. */
export function AiGeneratedContentNotice({
  contentKind = "output",
  className,
}: {
  contentKind?: "output" | "report" | "summary" | "plan";
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80",
        className
      )}
    >
      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
      <span>
        <strong className="font-semibold text-foreground/70">
          AI-generated {contentKind}.
        </strong>{" "}
        It may contain errors and is not professional advice. Verify important
        results before relying on it.
      </span>
    </p>
  );
}
