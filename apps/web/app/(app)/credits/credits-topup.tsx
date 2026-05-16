"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const PACKS = [
  { amount: 5,  label: "$5",  sub: "~500 calls" },
  { amount: 10, label: "$10", sub: "~1k calls" },
  { amount: 25, label: "$25", sub: "~2.5k calls" },
  { amount: 50, label: "$50", sub: "~5k calls" },
] as const;

export function CreditsTopUp() {
  const [buying, setBuying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(amount: number) {
    setBuying(amount);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amount }),
      });
      if (!res.ok) { setError("Failed to start checkout. Please try again."); return; }
      const { url } = await res.json() as { url: string };
      if (url) window.location.href = url;
    } finally {
      setBuying(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {PACKS.map(({ amount, label, sub }) => (
          <button
            key={amount}
            type="button"
            disabled={buying !== null}
            onClick={() => { void handleBuy(amount); }}
            className={cn(
              "group flex flex-col items-center rounded-xl border border-border bg-background px-3 py-3 transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-40",
              buying === amount && "border-primary/50 bg-primary/5",
            )}
          >
            <span className="text-base font-bold group-hover:text-primary">
              {buying === amount ? "…" : label}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">{sub}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
