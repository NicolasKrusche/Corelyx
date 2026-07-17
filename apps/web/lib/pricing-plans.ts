/**
 * Single source of truth for plan pricing numbers, shared by the public
 * pricing page (components/ui/pricing-section-4.tsx) and the authenticated
 * plan page (components/pricing/pricing-tiers.tsx) so the two can't drift.
 * Feature lists live separately in lib/pricing-features.ts.
 */

export type PlanKey = "free" | "plus" | "pro" | "builder";

export interface PlanPricing {
  name: string;
  badge: string;
  /** Monthly price in EUR, billed monthly. */
  price: number;
  /** Total price in EUR billed once a year. */
  yearlyPrice: number;
  /** Effective monthly price in EUR when billed yearly (yearlyPrice / 12). */
  yearlyMonthly: number;
}

export const PLAN_PRICING: Record<PlanKey, PlanPricing> = {
  free: { name: "Free", badge: "Get started", price: 0, yearlyPrice: 0, yearlyMonthly: 0 },
  plus: { name: "Solo", badge: "For individuals", price: 9.9, yearlyPrice: 83, yearlyMonthly: 6.9 },
  pro: { name: "Team", badge: "Most popular", price: 19.9, yearlyPrice: 191, yearlyMonthly: 15.9 },
  builder: { name: "Scale", badge: "For agencies", price: 49.9, yearlyPrice: 479, yearlyMonthly: 39.9 },
};

/** Format a EUR amount the same way everywhere pricing is shown (e.g. "€9.90", "€0"). */
export function formatEur(value: number): string {
  return value === 0
    ? "€0"
    : `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
