"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Config = {
  isEnabled: boolean;
  thresholdUsd: number;
  rechargeAmountUsd: number;
};

const THRESHOLD_OPTIONS = [1, 2, 5, 10] as const;
const AMOUNT_OPTIONS = [5, 10, 25, 50] as const;

export function AutoRechargeSettings({ hasSavedPaymentMethod }: { hasSavedPaymentMethod: boolean }) {
  const [config, setConfig] = useState<Config>({
    isEnabled: false,
    thresholdUsd: 2,
    rechargeAmountUsd: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/credits/auto-recharge")
      .then((r) => r.json() as Promise<Config>)
      .then(setConfig)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save(next: Config) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/credits/auto-recharge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setConfig(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    void save({ ...config, isEnabled: !config.isEnabled });
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-border bg-card p-5">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-2 h-3 w-48 rounded bg-muted" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-sm">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground">
              <path d="M7 1v3M7 10v3M1 7h3M10 7h3M2.9 2.9l2.1 2.1M8.9 8.9l2.1 2.1M2.9 11.1l2.1-2.1M8.9 5.1l2.1-2.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Auto-recharge
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Top up automatically when your balance gets low.</p>
        </div>
        {/* Toggle */}
        <button
          type="button"
          disabled={saving}
          onClick={toggle}
          aria-label={config.isEnabled ? "Disable auto-recharge" : "Enable auto-recharge"}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            config.isEnabled ? "bg-primary" : "bg-muted",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
              config.isEnabled ? "translate-x-4.5" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <div className={cn("mt-4 rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3 transition-opacity", !config.isEnabled && "opacity-40 pointer-events-none")}>
        {!hasSavedPaymentMethod && config.isEnabled && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No saved payment method. Complete a manual top-up first — your card will be saved for automatic charges.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Recharge when balance drops below</p>
          <div className="flex flex-wrap gap-1.5">
            {THRESHOLD_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void save({ ...config, thresholdUsd: t })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  config.thresholdUsd === t
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-border bg-background hover:bg-muted/40"
                )}
              >
                ${t.toFixed(2)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Recharge amount</p>
          <div className="flex flex-wrap gap-1.5">
            {AMOUNT_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => void save({ ...config, rechargeAmountUsd: a })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  config.rechargeAmountUsd === a
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-border bg-background hover:bg-muted/40"
                )}
              >
                ${a}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground/70">
          <span>
            Will charge <span className="font-medium text-foreground">${config.rechargeAmountUsd}</span> when balance &lt; <span className="font-medium text-foreground">${config.thresholdUsd.toFixed(2)}</span>
          </span>
          {saved && <span className="text-green-600 font-medium">Saved ✓</span>}
        </div>
      </div>
    </section>
  );
}
