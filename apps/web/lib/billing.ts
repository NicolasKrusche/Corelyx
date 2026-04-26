export type PaidTier = "plus" | "pro" | "builder";
export type BillingInterval = "month" | "year";

const PRICE_ENV_MAP: Record<PaidTier, Record<BillingInterval, string>> = {
  plus: {
    month: "STRIPE_PRICE_PLUS_MONTHLY",
    year: "STRIPE_PRICE_PLUS_YEARLY",
  },
  pro: {
    month: "STRIPE_PRICE_PRO_MONTHLY",
    year: "STRIPE_PRICE_PRO_YEARLY",
  },
  builder: {
    month: "STRIPE_PRICE_BUILDER_MONTHLY",
    year: "STRIPE_PRICE_BUILDER_YEARLY",
  },
};

export function getStripePriceId(tier: PaidTier, interval: BillingInterval): string {
  const envKey = PRICE_ENV_MAP[tier][interval];
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Missing ${envKey} environment variable.`);
  }
  return priceId;
}

export function getTierFromPriceId(priceId: string): PaidTier | null {
  if (!priceId) return null;

  if (
    priceId === process.env.STRIPE_PRICE_PLUS_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PLUS_YEARLY
  ) {
    return "plus";
  }

  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_YEARLY
  ) {
    return "pro";
  }

  if (
    priceId === process.env.STRIPE_PRICE_BUILDER_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_BUILDER_YEARLY
  ) {
    return "builder";
  }

  return null;
}

export function parsePaidTier(value: string | null): PaidTier | null {
  if (value === "plus" || value === "pro" || value === "builder") return value;
  return null;
}

export function parseBillingInterval(value: string | null): BillingInterval | null {
  if (value === "month" || value === "year") return value;
  return null;
}
