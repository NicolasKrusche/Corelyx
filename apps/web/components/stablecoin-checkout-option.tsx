import type { BillingInterval, PaidTier } from "@/lib/billing";

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
      <form action="/api/billing/checkout" method="POST" className="mt-1.5">
        <input type="hidden" name="tier" value={tier} />
        <input type="hidden" name="interval" value={interval} />
        <input type="hidden" name="payment_method" value="stablecoin" />
        {welcomeOffer && <input type="hidden" name="welcome_offer" value="true" />}
        <button
          type="submit"
          className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Pay with stablecoin
        </button>
      </form>
      <p className="mt-1 text-[9px] text-muted-foreground/40">USDC via Stripe</p>
    </details>
  );
}
