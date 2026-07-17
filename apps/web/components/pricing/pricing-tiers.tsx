"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket, Shield, Sparkles, Users, type LucideIcon } from "lucide-react";
import type { BillingInterval, PaidTier } from "@/lib/billing";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import {
  PricingTable,
  PricingTableBody,
  PricingTableCell,
  PricingTableHead,
  PricingTableHeader,
  PricingTablePlan,
  PricingTableRow,
} from "@/components/ui/pricing-table";
import { COMPARISON_FEATURES } from "@/lib/pricing-features";
import { PLAN_PRICING, formatEur } from "@/lib/pricing-plans";

export const TIERS = [
  {
    name: PLAN_PRICING.free.name,
    price: formatEur(PLAN_PRICING.free.price),
    period: "",
    description: "Free while you're testing. You'll hit the limits fast.",
    highlight: false,
    features: [
      { text: "2 programs", note: "(hard limit)" },
      { text: "50 runs / month" },
      { text: "150+ standard connectors", note: "(OAuth-based apps)" },
      { text: "7-day run history" },
      { text: "Visual editor only" },
      { text: "3 Genesis AI uses / month" },
      { text: "Manual & cron triggers" },
      { text: "Human-in-the-loop approvals" },
      { text: "Community support" },
    ],
    missing: ["AI agents (one-time tasks)", "BYOK (Bring your own key)", "Pay-per-use connectors (Stripe, Twilio, OpenAI…)", "Custom conflict handling (skip/fail)"],
  },
  {
    name: PLAN_PRICING.plus.name,
    price: formatEur(PLAN_PRICING.plus.price),
    yearlyPrice: formatEur(PLAN_PRICING.plus.yearlyMonthly),
    yearlyBilledAs: "billed annually",
    period: "/ month",
    roiMonth: "Pays for itself after 1 saved hour/month",
    roiYear: "Pays for itself after 12 saved hours/year",
    trust: "Cancel anytime",
    description: "For individuals who need more runs and no program limits.",
    highlight: false,
    features: [
      { text: "5 programs" },
      { text: "75 runs / month" },
      { text: "All 200+ connectors", note: "(incl. Stripe, Twilio, OpenAI, AWS S3…)" },
      { text: "AI agents", note: "(plan, approve & run one-time tasks)" },
      { text: "Bring your own API keys (BYOK)" },
      { text: "15,000 platform AI credits / month", note: "(use any model, no setup)" },
      { text: "30-day run history" },
      { text: "5 Genesis AI uses / month" },
      { text: "Manual, cron & webhook triggers" },
      { text: "Human-in-the-loop approvals" },
      { text: "Email support" },
    ],
    missing: ["Custom conflict handling (skip/fail)"],
  },
  {
    name: PLAN_PRICING.pro.name,
    price: formatEur(PLAN_PRICING.pro.price),
    yearlyPrice: formatEur(PLAN_PRICING.pro.yearlyMonthly),
    yearlyBilledAs: "billed annually",
    period: "/ month",
    description: "For teams running automations in production.",
    highlight: true,
    badge: "Most popular",
    socialProof: "Used by teams across 30+ countries",
    features: [
      { text: "Unlimited programs" },
      { text: "Up to 3 team seats" },
      { text: "AI agents", note: "(plan, approve & run one-time tasks)" },
      { text: "Human-in-the-loop approvals" },
      { text: "Custom conflict handling (skip/fail)" },
      { text: "500 runs / month — enough for daily automations across your whole team" },
      { text: "All 200+ connectors" },
      { text: "BYOK + 60,000 platform AI credits / month" },
      { text: "90-day run history" },
      { text: "All trigger types" },
      { text: "Priority support" },
    ],
    missing: [],
  },
  {
    name: PLAN_PRICING.builder.name,
    price: formatEur(PLAN_PRICING.builder.price),
    yearlyPrice: formatEur(PLAN_PRICING.builder.yearlyMonthly),
    yearlyBilledAs: "billed annually",
    period: "/ month",
    trust: "Cancel anytime · No contracts",
    description: "For agencies and enterprises managing clients at scale.",
    highlight: false,
    features: [
      { text: "Everything in Team" },
      { text: "150,000 platform AI credits / month", note: "(included, resets monthly)" },
      { text: "Unlimited team seats" },
      { text: "2,000 runs / month", note: "(custom available)" },
      { text: "1-year run history" },
      { text: "Dedicated success manager" },
      { text: "Custom integrations on request" },
      { text: "SLA guarantee" },
    ],
    missing: [],
  },
] as const;

export const ENTERPRISE_TIER = {
  name: "Enterprise",
  description: "Custom volume, dedicated infrastructure, SSO, audit logs, and a named success team. Built around your requirements.",
  features: [
    "Unlimited runs — negotiated to your volume",
    "Dedicated infrastructure & private cloud options",
    "SSO / SAML & advanced access controls",
    "Full audit log & compliance exports",
    "Custom SLA with guaranteed uptime",
    "Onboarding, training & custom integrations",
    "Named customer success manager",
  ],
} as const;

export const FAQ = [
  {
    q: "What counts as a run?",
    a: "A run is one full execution of a program — from trigger to completion, regardless of how many nodes it contains.",
  },
  {
    q: "What is BYOK?",
    a: "Bring Your Own Key. You add your own Anthropic, OpenAI, Groq, Google, or OpenRouter API key and model costs go directly to your provider account — no markup.",
  },
  {
    q: "What are platform AI credits?",
    a: "An alternative to BYOK - use Corelyx's managed key and pay from a credit balance. Credits are included monthly with Solo (15,000), Team (60,000), and Scale (150,000) plans, and you can top up anytime. All providers are supported via a single key.",
  },
  {
    q: "Can I use my own API keys on paid plans?",
    a: "Yes — BYOK works on Solo and above. You can also mix: use BYOK for most nodes and platform credits for others.",
  },
  {
    q: "What happens if I exceed my run limit?",
    a: "We'll warn you at 80% usage. Once you hit the limit, new runs are queued until your next monthly reset. You can upgrade at any time to increase your allowance.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "Yes — use a promo code to get a free trial. Codes are available during our beta period. Reach out or check our social channels.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes. Cancel any time from your account settings. Your plan stays active until the end of the billing period — no pro-rated refunds, no lock-in.",
  },
];

type TierCTA = {
  label: string;
  labelYear?: string;
  style: "primary" | "border" | "disabled";
  href?: string;
  checkout?: { tier: PaidTier; interval: BillingInterval };
};

type EnterpriseCTA = {
  label: string;
  href: string;
};

const PLAN_META: { icon: LucideIcon; badge: string }[] = [
  { icon: Sparkles, badge: "Free" },
  { icon: Shield, badge: "For individuals" },
  { icon: Users, badge: "Most popular" },
  { icon: Rocket, badge: "For agencies" },
];

const ctaClasses = (style: TierCTA["style"], popular: boolean) =>
  popular
    ? "bg-primary text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.55)]"
    : style === "primary"
      ? "bg-primary text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.55)]"
      : "border border-border bg-background/50 hover:bg-accent hover:border-border/80";

export function PricingTiers({ ctas, enterpriseCta }: { ctas: TierCTA[]; enterpriseCta: EnterpriseCTA }) {
  const [interval, setInterval] = useState<"month" | "year">("year");

  return (
    <div className="space-y-6">
      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background/50 p-1">
          <button
            onClick={() => setInterval("month")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
              interval === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("year")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
              interval === "year"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly
            <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-2 py-0.5 leading-none">
              save 2 months
            </span>
          </button>
        </div>
      </div>

      {/* Comparison table */}
      <PricingTable className="mx-auto max-w-5xl">
        <PricingTableHeader>
          <PricingTableRow>
            <th />
            {TIERS.map((tier, i) => {
              const meta = PLAN_META[i];
              const cta = ctas[i];
              const isPaid = "yearlyPrice" in tier;
              const showYearly = interval === "year" && isPaid;
              const displayPrice = showYearly ? (tier as { yearlyPrice: string }).yearlyPrice : tier.price;
              const compareAt = showYearly ? tier.price : undefined;
              const displayLabel = interval === "year" && cta.labelYear ? cta.labelYear : cta.label;
              const billedAs = showYearly && "yearlyBilledAs" in tier ? tier.yearlyBilledAs : null;
              const roiText = "roiYear" in tier && "roiMonth" in tier
                ? interval === "year" ? tier.roiYear : tier.roiMonth
                : null;

              return (
                <th key={tier.name} className="p-1">
                  <PricingTablePlan
                    name={tier.name}
                    badge={("badge" in tier && tier.badge) || meta.badge}
                    icon={meta.icon}
                    price={displayPrice}
                    compareAt={compareAt}
                    className={
                      tier.highlight
                        ? "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_18px_40px_rgba(0,0,0,0.35)]"
                        : undefined
                    }
                  >
                    {billedAs && (
                      <p className="text-muted-foreground/60 mb-1 text-center text-[11px]">{billedAs}</p>
                    )}
                    {roiText && (
                      <p className="mb-2 text-center text-[11px] font-medium text-green-400/80">{roiText}</p>
                    )}

                    {cta.style === "disabled" ? (
                      <span className="block w-full cursor-default rounded-lg border border-border bg-background/50 px-5 py-2.5 text-center text-sm font-bold opacity-50">
                        {displayLabel}
                      </span>
                    ) : cta.checkout ? (
                      <BillingCheckoutButton
                        tier={cta.checkout.tier}
                        interval={interval}
                        className={`w-full rounded-lg px-5 py-2.5 text-center text-sm font-bold transition-all duration-200 disabled:cursor-wait disabled:opacity-70 ${ctaClasses(cta.style, tier.highlight)}`}
                      >
                        {displayLabel}
                      </BillingCheckoutButton>
                    ) : (
                      <Link
                        href={cta.href ?? "/dashboard"}
                        className={`block w-full rounded-lg px-5 py-2.5 text-center text-sm font-bold transition-all duration-200 ${ctaClasses(cta.style, tier.highlight)}`}
                      >
                        {displayLabel}
                      </Link>
                    )}

                    {"socialProof" in tier && tier.socialProof && (
                      <p className="text-muted-foreground/50 mt-2 text-center text-[11px]">{tier.socialProof}</p>
                    )}
                    {"trust" in tier && tier.trust && (
                      <p className="text-muted-foreground/40 mt-2 text-center text-[11px]">{tier.trust}</p>
                    )}
                  </PricingTablePlan>
                </th>
              );
            })}
          </PricingTableRow>
        </PricingTableHeader>
        <PricingTableBody>
          {COMPARISON_FEATURES.map((feature) => (
            <PricingTableRow key={feature.label}>
              <PricingTableHead>{feature.label}</PricingTableHead>
              {TIERS.map((tier, i) => (
                <PricingTableCell key={tier.name}>{feature.values[i]}</PricingTableCell>
              ))}
            </PricingTableRow>
          ))}
        </PricingTableBody>
      </PricingTable>

      {/* Enterprise banner */}
      <div className="relative mx-auto flex max-w-5xl flex-col gap-6 rounded-2xl border border-border bg-card px-8 py-7 md:flex-row md:items-center md:gap-10">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent rounded-t-2xl" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">{ENTERPRISE_TIER.name}</p>
          <p className="text-lg font-black tracking-tight">Custom pricing. Built for you.</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">{ENTERPRISE_TIER.description}</p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {ENTERPRISE_TIER.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-foreground/70">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0">
          <a
            href={enterpriseCta.href}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-background/50 px-6 py-3 text-sm font-bold transition-all duration-200 hover:bg-accent hover:border-border/80 whitespace-nowrap"
          >
            {enterpriseCta.label}
          </a>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/40">No commitment required</p>
        </div>
      </div>
    </div>
  );
}

export function PricingFAQ() {
  return (
    <div className="space-y-0 divide-y divide-border/60">
      {FAQ.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-sm font-semibold hover:text-primary transition-colors">
            {item.q}
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0 text-muted-foreground/50 group-open:rotate-180 transition-transform duration-200">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </summary>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
