import Link from "next/link";
import { ArrowLeft, Bot, Check, Sparkles } from "lucide-react";

/**
 * Locked-state card shown to Free-tier users on the agents pages. Agents are a
 * Solo+ feature (see lib/entitlements.ts), so rather than letting a Free user
 * hit a 403 when building/running, we show what agents do and route to /plan.
 */
export function AgentsUpsell({ showBack = false }: { showBack?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      {showBack && (
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to agents
        </Link>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card/80 shadow-sm">
        <div className="flex items-center gap-3 border-b bg-primary/5 px-6 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="text-base font-bold">Let an agent manage your workflows and account</p>
            <p className="text-sm text-muted-foreground">
              A Solo feature: describe what you need, the agent plans it, you approve, it runs.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          {[
            "Ask an agent to build, edit, or turn workflows on/off for you — no editor required",
            "Agents check your account: run history, connected apps, usage — and act on what they find",
            "Agents reason and act on your connected apps — Slack, HubSpot, Gmail and more",
            "Dry-run first: read-only steps run, write actions are simulated",
            "Counts against your monthly runs; on platform keys, LLM usage draws from your AI credits — bring your own key and it's free",
          ].map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="text-sm text-foreground/80">{line}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t bg-muted/20 px-6 py-4">
          <Link
            href="/plan"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Solo
          </Link>
          <span className="text-xs text-muted-foreground">
            from €6.90/mo billed annually · cancel anytime
          </span>
        </div>
      </div>
    </div>
  );
}
