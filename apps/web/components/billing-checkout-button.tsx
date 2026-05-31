"use client";

import { useState, type ReactNode } from "react";
import type { BillingInterval, PaidTier } from "@/lib/billing";

export function BillingCheckoutButton({
  tier,
  interval,
  paymentMethod = "card",
  welcomeOffer = false,
  className,
  pendingLabel = "Opening checkout...",
  children,
}: {
  tier: PaidTier;
  interval: BillingInterval;
  paymentMethod?: "card" | "stablecoin";
  welcomeOffer?: boolean;
  className: string;
  pendingLabel?: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          interval,
          payment_method: paymentMethod,
          ...(welcomeOffer ? { welcome_offer: "true" } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.url) {
        throw new Error(body?.error ?? "Checkout could not be started. Please try again.");
      }

      window.location.assign(body.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Checkout could not be started. Please try again."
      );
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => { void startCheckout(); }}
        className={className}
      >
        {pending ? pendingLabel : children}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-center text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
