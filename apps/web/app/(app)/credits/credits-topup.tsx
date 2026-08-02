"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CREDIT_PACKS, formatCredits, formatPackRate } from "@/lib/credit-packs";

const CRYPTO_ENABLED = process.env.NEXT_PUBLIC_STRIPE_CRYPTO_ENABLED === "true";

const PACKS = CREDIT_PACKS.map((pack) => ({
  ...pack,
  badge: pack.priceUsd === 10 ? "POPULAR" : pack.priceUsd === 50 ? "BEST VALUE" : null,
}));

export function CreditsTopUp() {
  const [selected, setSelected] = useState<number>(10_000);
  const selectedPack = PACKS.find(({ credits }) => credits === selected) ?? PACKS[1];
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(paymentMethod: "card" | "stablecoin" = "card") {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_credits: selected, payment_method: paymentMethod }),
      });
      if (!res.ok) { setError("We could not open checkout. Please try again."); return; }
      const { url } = await res.json() as { url: string };
      if (url) window.location.href = url;
    } finally {
      setBuying(false);
    }
  }

  return (
    <div>
      {/* Pack grid */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {PACKS.map(({ credits, priceUsd, badge, bonusLabel }) => (
          <button
            key={credits}
            type="button"
            disabled={buying}
            onClick={() => setSelected(credits)}
            className={cn(
              "relative flex flex-col items-center rounded-xl border px-3 py-3.5 transition-all hover:border-primary/50",
              selected === credits
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:bg-muted/40",
              buying && "pointer-events-none opacity-40"
            )}
          >
            {badge && (
              <span className={cn(
                "absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                badge === "POPULAR"
                  ? "bg-primary text-primary-foreground"
                  : "bg-amber-500 text-white"
              )}>
                {badge}
              </span>
            )}
            {selected === credits && (
              <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary">
                <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                  <path d="M1 2.5L2.5 4L6 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            )}
            <span className={cn("text-base font-bold", selected === credits && "text-primary")}>{formatCredits(credits)}</span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">${priceUsd}</span>
            {bonusLabel && <span className="mt-0.5 text-[10px] font-semibold text-green-600">{bonusLabel}</span>}
          </button>
        ))}
      </div>

      {/* Order summary */}
      <div className="mb-4 overflow-hidden rounded-xl border border-border/60 bg-muted/20 divide-y divide-border/40">
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Selected pack</span>
          <span className="font-medium">{formatCredits(selectedPack.credits)} credits</span>
        </div>
        {/* The $25 and $50 packs grant bonus credits, so their rate beats the
            1,000-per-dollar base. Spell it out rather than leaving the buyer to
            divide it themselves. */}
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Rate</span>
          <span className={selectedPack.bonusLabel ? "font-medium text-green-600" : "text-muted-foreground"}>
            {formatPackRate(selectedPack)}
            {selectedPack.bonusLabel && ` · ${selectedPack.bonusLabel}`}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 text-sm font-semibold">
          <span>Total today</span>
          <span>${selectedPack.priceUsd.toFixed(2)}</span>
        </div>
      </div>

      {/* Pay button */}
      <button
        type="button"
        disabled={buying}
        onClick={() => { void handleBuy(); }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
      >
        {buying ? (
          "Redirecting to checkout…"
        ) : (
          <>
            Pay ${selectedPack.priceUsd.toFixed(2)}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      {CRYPTO_ENABLED && (
        <details className="mt-2 text-center">
          <summary className="cursor-pointer text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground">
            More payment options
          </summary>
          <button
            type="button"
            disabled={buying}
            onClick={() => { void handleBuy("stablecoin"); }}
            className="mt-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Pay with stablecoin
          </button>
          <p className="mt-1 text-[9px] text-muted-foreground/40">USDC via Stripe</p>
        </details>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Credits are used when workflows run via the Corelyx platform key.
      </p>
    </div>
  );
}

export function PastPurchasesLink() {
  return (
    <Link
      href="#activity"
      className="inline-flex items-center gap-1.5 rounded-lg border glass-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-60">
        <path d="M6 1v5l3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
      Past purchases
    </Link>
  );
}
