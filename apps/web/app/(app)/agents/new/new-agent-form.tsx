"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { friendlyErrorMessage } from "@/lib/friendly-errors";

type Phase = "describe" | "building" | "error";

type Starter = { title: string; blurb: string; prompt: string };

const STARTERS: Starter[] = [
  {
    title: "Stale deal chaser",
    blurb: "Find deals stuck in a stage and draft follow-ups",
    prompt:
      "Check all HubSpot deals that have been in 'Proposal Sent' for more than 14 days and draft a follow-up email for each one. Ask me before sending anything.",
  },
  {
    title: "Support ticket digest",
    blurb: "Group this week's tickets and summarise for standup",
    prompt:
      "Pull this week's support tickets from Zendesk, group them by topic, and write a summary I can paste into the team standup.",
  },
  {
    title: "Broken workflow triage",
    blurb: "Find why runs failed and report back",
    prompt:
      "Go through my failed workflow runs from the last 7 days, figure out which ones broke because a connection expired, and send me a Slack summary.",
  },
  {
    title: "Inbox triager",
    blurb: "Classify new emails and flag what needs me",
    prompt:
      "Review my unread Gmail from today, classify each as urgent / FYI / can-ignore, and give me a short list of the ones that need a reply, with a suggested response for each.",
  },
  {
    title: "Competitor watch",
    blurb: "Check a page for changes and summarise",
    prompt:
      "Fetch our top competitor's pricing page, compare it to what you found last time, and tell me what changed.",
  },
  {
    title: "Weekly metrics recap",
    blurb: "Pull numbers and write a recap",
    prompt:
      "Pull this week's key numbers from Stripe (new revenue, churn) and write a short recap I can share with the team.",
  },
];

function Spinner() {
  return (
    <svg
      className="h-5 w-5 shrink-0 animate-spin text-primary"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function NewAgentForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("describe");
  const [status, setStatus] = useState("Designing your agent...");
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const connectionIdsRef = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; is_valid: boolean }>) => {
        connectionIdsRef.current = data
          .filter((c) => c.is_valid)
          .map((c) => c.id);
      })
      .catch(() => {});
  }, []);

  async function build() {
    if (description.trim().length < 10 || startedRef.current) return;
    startedRef.current = true;
    setPhase("building");
    setError(null);
    setThoughts([]);
    setStatus("Designing your agent...");

    const payload = {
      description: description.trim(),
      connection_ids: connectionIdsRef.current,
      use_platform_key: true as const,
      program_type: "agent" as const,
    };

    try {
      const res = await fetch("/api/genesis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let message =
          "We couldn't start building your agent. Please try again.";
        try {
          const b = (await res.clone().json()) as {
            error?: unknown;
            message?: unknown;
          };
          if (typeof b.message === "string")
            message = friendlyErrorMessage(b.message, message);
          else if (typeof b.error === "string")
            message = friendlyErrorMessage(b.error, message);
        } catch {}
        setError(message);
        setPhase("error");
        startedRef.current = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    } catch (err) {
      setError(
        friendlyErrorMessage(
          (err as Error).message,
          "We couldn't connect. Check your connection and try again."
        )
      );
      setPhase("error");
      startedRef.current = false;
    }
  }

  function handleEvent(
    event: { type: string } & Record<string, unknown>
  ) {
    switch (event.type) {
      case "meta":
        if (typeof event.program_name === "string") {
          setStatus(`Planning "${event.program_name}"...`);
          setThoughts((p) => [
            ...p,
            `Named the agent "${event.program_name}"`,
          ]);
        }
        return;
      case "node":
        if (event.node && typeof event.node === "object") {
          const n = event.node as {
            type?: string;
            label?: string;
            id?: string;
          };
          setThoughts((p) => [
            ...p,
            `Added ${n.type ?? "step"}: ${n.label ?? n.id ?? ""}`,
          ]);
        }
        return;
      case "status":
        if (typeof event.message === "string") setStatus(event.message);
        return;
      case "done": {
        const programId = event.program_id as string | undefined;
        setStatus("Opening your agent...");
        if (programId) router.replace(`/agents/${programId}`);
        return;
      }
      case "error":
        setError(
          friendlyErrorMessage(
            typeof event.message === "string" ? event.message : null,
            "We couldn't build the agent. Please try again."
          )
        );
        setPhase("error");
        startedRef.current = false;
        return;
    }
  }

  const canSubmit = description.trim().length >= 10;

  /* ── Building phase ─────────────────────────────────────── */
  if (phase === "building") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to agents
        </Link>

        <div className="rounded-2xl border bg-card/80 p-8 shadow-sm">
          {/* Animated header */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Spinner />
            </div>
            <div>
              <p className="text-base font-bold">Building your agent</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{status}</p>
            </div>
          </div>

          {/* Thought stream */}
          {thoughts.length > 0 && (
            <div className="mt-6 space-y-2 border-t pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Planning steps
              </p>
              <ul className="space-y-2">
                {thoughts.slice(-8).map((t, i) => (
                  <li
                    key={`${t}-${i}`}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Describe phase ─────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to agents
      </Link>

      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            New one-time agent
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Describe a single task you want done — the agent will plan it out,
          wait for your approval, then run exactly once.
        </p>
      </div>

      {/* Main input card */}
      <div className="rounded-2xl border bg-card/80 p-1 shadow-sm">
        <Textarea
          ref={textareaRef}
          className="min-h-[160px] resize-none rounded-xl border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          placeholder="Describe the task in plain language…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
              e.preventDefault();
              void build();
            }
          }}
        />
        <div className="flex items-center justify-between border-t px-3 py-2.5">
          <span className="text-xs text-muted-foreground">
            {description.length} / 2000
            <span className="ml-2 hidden sm:inline opacity-50">
              ⌘↵ to build
            </span>
          </span>
          <button
            disabled={!canSubmit}
            onClick={() => void build()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            Plan &amp; build
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {phase === "error" && error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Starter templates */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground/60" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Start from a template
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => {
                setDescription(s.prompt);
                textareaRef.current?.focus();
              }}
              className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
