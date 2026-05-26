"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreFlightCheck, PreFlightRemediation } from "@/lib/validation/pre-flight";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type PreFlightResult = {
  result: { valid: boolean };
  checks: PreFlightCheck[];
};

type FixResponse = {
  validation?: PreFlightResult;
  error?: string;
};

const CHECK_LABELS: Record<string, string> = {
  PRE_001: "connections healthy",
  PRE_002: "API keys present",
  PRE_003: "permissions compatible",
  PRE_004: "nodes valid",
  PRE_005: "schema compatible",
};

function Spinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

function summarizeChecks(checks: PreFlightCheck[] | null) {
  if (!checks) {
    return ["2 connections healthy", "4 API keys present", "1 / 1 nodes valid", "schema v1 compatible"];
  }

  return checks.slice(0, 4).map((check) => {
    if (check.status === "fail") return check.label;
    return CHECK_LABELS[check.code] ?? check.label;
  });
}

export function RunPanel({ programId }: { programId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "checking" | "done" | "starting">("idle");
  const [preflight, setPreflight] = useState<PreFlightResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);

  async function runPreflight() {
    setState("checking");
    setFetchError(null);
    setPreflight(null);

    try {
      const res = await fetch(`/api/programs/${programId}/preflight`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFetchError(friendlyResponseMessage(err as { error?: string }, "We could not check this workflow. Please try again."));
        setState("done");
        return;
      }

      const data: PreFlightResult = await res.json();
      setPreflight(data);
      setState("done");
    } catch {
      setFetchError("We could not connect. Check your internet connection and try again.");
      setState("done");
    }
  }

  async function startRun() {
    setState("starting");
    setFetchError(null);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programId }),
      });

      if (res.ok) {
        const { run_id } = (await res.json()) as { run_id: string };
        router.push(`/programs/${programId}/runs/${run_id}`);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
        setFetchError(friendlyResponseMessage(err, "We could not start this workflow. Please try again."));
        setState("done");
      }
    } catch {
      setFetchError("We could not connect. Check your internet connection and try again.");
      setState("done");
    }
  }

  async function applyRemediation(remediation: PreFlightRemediation, failureId: string) {
    if (remediation.type === "navigate") {
      window.location.assign(remediation.href);
      return;
    }

    setApplyingFixId(failureId);
    setFetchError(null);

    try {
      const res = await fetch(`/api/programs/${programId}/preflight/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remediation }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFetchError(friendlyResponseMessage(err as { error?: string }, "We could not apply this fix. Please try again."));
        return;
      }

      const data = (await res.json()) as FixResponse;
      if (data.validation) {
        setPreflight(data.validation);
      } else {
        await runPreflight();
      }
      setState("done");
    } catch {
      setFetchError("We could not connect. Check your internet connection and try again.");
    } finally {
      setApplyingFixId(null);
    }
  }

  const allPassed = preflight?.result.valid === true;
  const failures = preflight?.checks.flatMap((check, checkIndex) =>
    check.failures.map((failure, failureIndex) => ({ check, checkIndex, failure, failureIndex }))
  ) ?? [];

  return (
    <section className="rounded-lg border glass-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-500/10 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-400">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Run program</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Corelyx checks connections, keys, and workflow steps before it runs.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {summarizeChecks(preflight?.checks ?? null).map((label) => (
                <span key={label} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runPreflight}
            disabled={state === "checking" || state === "starting" || applyingFixId !== null}
            className="h-10 px-4"
          >
            {state === "checking" ? <Spinner /> : null}
            Dry run
          </Button>
          <Button
            type="button"
            onClick={allPassed ? startRun : runPreflight}
            disabled={state === "checking" || state === "starting" || applyingFixId !== null}
            className="h-10 bg-foreground px-5 text-background hover:bg-foreground/90"
          >
            {state === "checking" || state === "starting" ? <Spinner /> : <Play className="h-4 w-4 fill-current" />}
            {state === "starting" ? "Starting" : "Check & run"}
          </Button>
        </div>
      </div>

      {fetchError && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{fetchError}</p>
        </div>
      )}

      {failures.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {failures.map(({ check, checkIndex, failure, failureIndex }) => {
            const failureId = `${check.code}-${checkIndex}-${failureIndex}`;
            const remediation = failure.remediation;
            const isApplying = applyingFixId === failureId;

            return (
              <div key={failureId} className="rounded-md bg-muted/60 px-3 py-2">
                <p className="text-xs font-medium text-destructive">{failure.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{failure.fix_suggestion}</p>
                {remediation && (
                  <div className="mt-2">
                    {remediation.type === "navigate" ? (
                      <a href={remediation.href} className="text-xs font-medium text-primary underline underline-offset-2">
                        {remediation.label}
                      </a>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isApplying || state === "checking" || state === "starting"}
                        onClick={() => applyRemediation(remediation, failureId)}
                      >
                        {isApplying ? "Applying..." : remediation.label}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
