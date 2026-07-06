"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Radar, MessagesSquare, GitPullRequestArrow, ShieldCheck } from "lucide-react";

const SEEN_KEY = "corelyx-genesis-v2-release";

// ─── Mini node card used in the preview mocks ──────────────────────────────────

function MockNode({
  accent,
  kicker,
  title,
  className,
  dimmed,
  pin,
}: {
  accent: string;
  kicker: string;
  title: string;
  className?: string;
  dimmed?: boolean;
  pin?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative w-[150px] shrink-0 rounded-xl border border-black/[0.07] bg-white p-2.5 shadow-sm dark:border-white/[0.09] dark:bg-[rgba(17,19,26,0.94)]",
        dimmed && "opacity-45 saturate-50",
        className
      )}
    >
      {pin && (
        <span className="genesis-question-pin absolute -left-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-amber-950 shadow-md ring-2 ring-amber-200/60">
          ?
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-white", accent)}>
          <span className="h-2 w-2 rounded-[3px] bg-white/90" />
        </span>
        <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</p>
      </div>
      <p className="mt-1.5 truncate text-[12px] font-semibold text-foreground">{title}</p>
    </div>
  );
}

function Connector() {
  return <div className="h-px w-6 shrink-0 bg-border" aria-hidden />;
}

// ─── Slides ────────────────────────────────────────────────────────────────────

type Slide = {
  kicker: string;
  title: string;
  body: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    kicker: "Genesis · Version 2",
    title: "Genesis just got a lot smarter",
    body: (
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: Radar, label: "Knows your accounts", text: "Reads your real channels, labels, and databases while it builds." },
          { icon: MessagesSquare, label: "Asks when unsure", text: "Pins a question to the node instead of guessing." },
          { icon: GitPullRequestArrow, label: "Edits you can watch", text: "Surgical changes, animated — never a silent swap." },
        ].map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-background/50 p-3">
            <f.icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-[12px] font-semibold text-foreground">{f.label}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    kicker: "It asks first",
    title: "No more guessing which channel",
    body: (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-0 rounded-xl border border-border bg-background/40 p-5">
          <MockNode accent="bg-emerald-500" kicker="Trigger" title="Weekday 8am" />
          <Connector />
          <MockNode accent="bg-sky-500" kicker="Read" title="Fetch emails" />
          <Connector />
          <MockNode accent="bg-indigo-500" kicker="Write" title="Post to Slack" pin />
        </div>
        <div className="mx-auto max-w-sm rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950">?</span>
            <p className="text-[11px] font-semibold text-foreground">Post to Slack</p>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Which channel should the summary go to? I picked <span className="font-medium text-foreground">#revenue</span>, but you have a few.
          </p>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          The workflow still finishes and saves — answering just fine-tunes it.
        </p>
      </div>
    ),
  },
  {
    kicker: "Surgical edits",
    title: "Watch every change happen",
    body: (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-0 rounded-xl border border-border bg-background/40 p-5">
          <MockNode accent="bg-emerald-500" kicker="Trigger · updated" title="Weekday 7am" className="genesis-preview-updated" />
          <Connector />
          <MockNode accent="bg-sky-500" kicker="Read" title="Fetch emails" />
          <Connector />
          <MockNode accent="bg-violet-500" kicker="Added" title="Save to Notion" className="genesis-preview-added" />
          <Connector />
          <MockNode accent="bg-rose-500" kicker="Removed" title="Old filter" className="genesis-preview-removed" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Added fades in</span>
          <span className="inline-flex items-center gap-1.5 text-amber-500"><span className="h-2 w-2 rounded-full bg-amber-500" /> Changed pulses</span>
          <span className="inline-flex items-center gap-1.5 text-rose-500"><span className="h-2 w-2 rounded-full bg-rose-500" /> Removed strikes through</span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Only the nodes you asked about move — everything else stays exactly where it was.
        </p>
      </div>
    ),
  },
  {
    kicker: "Private by design",
    title: "Grounded in your data, without exposing it",
    body: (
      <div className="space-y-4">
        <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background/50 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Genesis reads your account structure to build accurately, but your channel names, labels, and
            database titles are pseudonymized before anything reaches the model — it works with placeholders,
            and your real names are substituted back only on your side.
          </p>
        </div>
        <p className="text-center text-[12px] font-medium text-foreground">
          Available now on the <span className="text-primary">Scale</span> plan.
        </p>
      </div>
    ),
  },
];

// ─── The slideshow modal ───────────────────────────────────────────────────────

export function GenesisV2ReleaseSlides({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const last = SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Accent header */}
        <div className="relative overflow-hidden border-b border-border/60 px-6 pb-4 pt-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(ellipse 60% 120% at 15% 0%, hsl(var(--primary) / 0.15), transparent 70%)" }}
          />
          <div className="relative flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              New in Genesis
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              Skip
            </button>
          </div>
          <p className="relative mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{slide.kicker}</p>
          <h2 className="relative mt-1 text-xl font-black tracking-tight text-foreground">{slide.title}</h2>
        </div>

        {/* Slide body — fixed min height so the card doesn't jump between slides */}
        <div className="min-h-[248px] px-6 py-5">
          <div key={index} className="genesis-slide-in">
            {slide.body}
          </div>
        </div>

        {/* Footer: dots + nav */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3.5">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Back
              </button>
            )}
            {index < last ? (
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Got it, let&apos;s go →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App-wide gate: shows the announcement once per version when published ─────

export function GenesisV2ReleaseGate() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/genesis/release", { cache: "no-store" });
        if (!res.ok) return;
        const state = (await res.json()) as { active?: boolean; version?: number };
        if (cancelled || state.active !== true) return;
        const v = typeof state.version === "number" ? state.version : 1;
        let seen: string | null = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch {}
        if (seen === String(v)) return;
        setVersion(v);
        setOpen(true);
      } catch {
        // Never block the app on the announcement.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, String(version)); } catch {}
    setOpen(false);
  }, [version]);

  if (!open) return null;
  return <GenesisV2ReleaseSlides onClose={dismiss} />;
}
