import type { FeatureItem } from "@/components/ui/pricing-table";

/**
 * Plan columns, in order, for the comparison matrix below.
 * Each `values` array in COMPARISON_FEATURES is indexed by this order.
 */
export const PLAN_COLUMNS = ["Free", "Solo", "Team", "Scale"] as const;

/**
 * Cross-plan feature comparison matrix.
 *
 * Built faithfully from the per-tier feature lists in
 * `components/pricing/pricing-tiers.tsx` and `components/ui/pricing-section-4.tsx`.
 * Where a higher tier states "Everything in <lower tier>", the lower value is
 * inherited (e.g. Team/Scale inherit Solo's Genesis access as Unlimited, Scale
 * inherits Team's approvals/conflict handling). Boolean rows render as a check or
 * a minus; string rows render their value verbatim.
 *
 * Values are ordered [Free, Solo, Team, Scale].
 */
export const COMPARISON_FEATURES: FeatureItem[] = [
  { label: "Programs", values: ["2", "5", "Unlimited", "Unlimited"] },
  { label: "Runs / month", values: ["50", "75", "500", "2,000"] },
  { label: "Team seats", values: ["1", "1", "Up to 3", "Unlimited"] },
  {
    label: "Connectors",
    values: ["150+ standard", "All 200+", "All 200+", "All 200+"],
  },
  {
    label: "Pay-per-use connectors (Stripe, Twilio, OpenAI…)",
    values: [false, true, true, true],
  },
  { label: "Bring your own key (BYOK)", values: [false, true, true, true] },
  {
    label: "Platform AI credits / month",
    values: ["—", "2,500", "10,000", "15,000"],
  },
  { label: "Genesis AI uses / month", values: ["3", "5", "Unlimited", "Unlimited"] },
  { label: "AI agents (one-time tasks)", values: [false, true, true, true] },
  { label: "Human-in-the-loop approvals", values: [true, true, true, true] },
  { label: "Custom conflict handling (skip/fail policies)", values: [false, false, true, true] },
  { label: "Run history", values: ["7 days", "30 days", "90 days", "1 year"] },
  {
    label: "Triggers",
    values: ["Manual & cron", "Manual, cron & webhook", "All types", "All types"],
  },
  { label: "Dedicated success manager", values: [false, false, false, true] },
  { label: "Custom integrations", values: [false, false, false, true] },
  { label: "SLA guarantee", values: [false, false, false, true] },
  { label: "Support", values: ["Community", "Email", "Priority", "Priority"] },
];
