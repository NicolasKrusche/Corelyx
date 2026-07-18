"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle, XCircle, Zap } from "lucide-react";

type Circuit = {
  name: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
};

function getStateIcon(state: string) {
  switch (state) {
    case "CLOSED":
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "OPEN":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "HALF_OPEN":
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    default:
      return <Activity className="w-5 h-5 text-muted-foreground" />;
  }
}

function getStateBadge(state: string) {
  const styles: Record<string, string> = {
    CLOSED: "bg-green-500/15 text-green-700 dark:text-green-300",
    OPEN: "bg-red-500/15 text-red-700 dark:text-red-300",
    HALF_OPEN: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[state] ?? styles.CLOSED}`}>
      {state.replace("_", "-")}
    </span>
  );
}

export function CircuitBreakersClient() {
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function fetchCircuits() {
    setError(null);
    const res = await fetch("/api/admin/circuits", { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Failed to load circuit breaker state.");
      return;
    }
    const data = (await res.json()) as { circuits: Circuit[] };
    setCircuits(data.circuits);
  }

  useEffect(() => {
    void fetchCircuits();
  }, []);

  async function handleReset() {
    setResetting(true);
    const res = await fetch("/api/admin/circuits", { method: "POST" });
    if (res.ok) {
      await fetchCircuits();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Failed to reset circuits.");
    }
    setResetting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Circuit Breakers</h1>
        <p className="text-muted-foreground">Monitor and manage circuit breaker states</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Circuit Breaker Cards */}
      <div className="grid gap-4">
        {circuits === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : circuits?.map((circuit) => (
          <div
            key={circuit.name}
            className="bg-card rounded-lg shadow-sm border border-border p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStateIcon(circuit.state)}
                <div>
                  <h3 className="text-lg font-semibold text-foreground capitalize">
                    {circuit.name.replace("_", " ")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Protects against cascading failures
                  </p>
                </div>
              </div>
              {getStateBadge(circuit.state)}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Success Count</p>
                <p className="text-xl font-semibold text-foreground">
                  {circuit.success_count.toLocaleString()}
                </p>
              </div>
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Failure Count</p>
                <p className={`text-xl font-semibold ${
                  circuit.failure_count > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
                }`}>
                  {circuit.failure_count}
                </p>
              </div>
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Last Failure</p>
                <p className="text-sm text-foreground">
                  {circuit.last_failure_at
                    ? new Date(circuit.last_failure_at).toLocaleString()
                    : "Never"
                  }
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* How It Works */}
      <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 p-6">
        <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          How Circuit Breakers Work
        </h3>
        <div className="space-y-3 text-sm text-blue-700 dark:text-blue-300">
          <p>
            <strong>CLOSED:</strong> Normal operation. Requests pass through.
          </p>
          <p>
            <strong>OPEN:</strong> Service failing. Requests are rejected immediately to prevent cascading failures.
          </p>
          <p>
            <strong>HALF-OPEN:</strong> Testing recovery. A limited number of test requests are allowed.
          </p>
          <div className="mt-4 pt-4 border-t border-blue-500/30">
            <p className="font-medium">Configuration:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Opens after 5 consecutive failures</li>
              <li>Stays open for 60 seconds minimum</li>
              <li>Allows 3 test calls in half-open state</li>
              <li>Closes after 3 consecutive successes</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Manual Reset */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Manual Reset</h3>
        <p className="text-sm text-muted-foreground mb-4">
          If a circuit breaker is stuck in OPEN state, you can manually reset it.
          Only do this if you&apos;re sure the underlying issue is resolved.
        </p>
        <button
          onClick={() => void handleReset()}
          disabled={resetting || circuits === null}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {resetting ? "Resetting…" : "Reset All Circuits"}
        </button>
      </div>
    </div>
  );
}
