import type { BillingInterval, PaidTier } from "@/lib/billing";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";

export function StablecoinCheckoutOption({
  tier,
  interval,
  welcomeOffer = false,
}: {
  tier: PaidTier;
  interval: BillingInterval;
  welcomeOffer?: boolean;
}) {
  return (
    <details className="mt-2 text-center">
      <summary className="cursor-pointer text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground">
        More payment options
      </summary>
      <div className="mt-1.5">
        <BillingCheckoutButton
          tier={tier}
          interval={interval}
          paymentMethod="stablecoin"
          welcomeOffer={welcomeOffer}
          pendingLabel="Opening..."
          className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-70"
        >
          Pay with stablecoin
        </BillingCheckoutButton>
      </div>
      <p className="mt-1 text-[9px] text-muted-foreground/40">USDC via Stripe</p>
    </details>
  );
}
