"use client";

import { useState, useEffect } from "react";
import { StablecoinCheckoutOption } from "@/components/stablecoin-checkout-option";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";

const DISMISS_KEY = "welcome_offer_dismissed";
const OFFER_DAYS = 7;

function formatExpiry(createdAt: string): string {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + OFFER_DAYS);
  return expiry.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function isWithinWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return now - created < OFFER_DAYS * 24 * 60 * 60 * 1000;
}

interface Props {
  createdAt: string;
  tier: string;
}

export function WelcomeOfferBanner({ createdAt, tier }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tier !== "free") return;
    if (!isWithinWindow(createdAt)) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, [createdAt, tier]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const expiry = formatExpiry(createdAt);

  return (
    <div className="relative z-20 mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5 shadow-[0_0_0_1px_hsl(var(--primary)/0.12),0_8px_32px_hsl(var(--primary)/0.1)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-t-2xl" />

      <button
        onClick={dismiss}
        aria-label="Dismiss offer"
        className="absolute right-4 top-4 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pr-6">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground mb-0.5">
            Welcome gift — one time, never again.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Start your first month on Solo for{" "}
            <span className="font-semibold text-foreground">€3.90</span> instead of €9.90.
            This offer disappears in 7 days and will never come back.
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
          <BillingCheckoutButton
            tier="plus"
            interval="month"
            welcomeOffer
            className="whitespace-nowrap rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.35)] transition-all duration-200 hover:shadow-[0_0_32px_hsl(var(--primary)/0.5)] disabled:cursor-wait disabled:opacity-70"
          >
            Claim 61% off — Start Solo
          </BillingCheckoutButton>
          <StablecoinCheckoutOption tier="plus" interval="month" welcomeOffer />
          <p className="text-[11px] text-muted-foreground/50">
            Cancel anytime · Expires {expiry}
          </p>
        </div>
      </div>
    </div>
  );
}
