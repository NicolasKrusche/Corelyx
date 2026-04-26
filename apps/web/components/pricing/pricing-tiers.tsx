"use client";

import { useState } from "react";
import Link from "next/link";
import type { BillingInterval, PaidTier } from "@/lib/billing";

export const TIERS = [
  {
    name: "Free",
    price: "€0",
    period: "",
    description: "Free while you're testing. You'll hit the limits fast.",
    highlight: false,
    features: [
      { text: "2 programs", note: "(hard limit)" },
      { text: "50 runs / month" },
      { text: "All 12+ connectors" },
      { text: "7-day run history" },
      { text: "Visual editor only" },
      { text: "1 Genesis AI use / month" },
      { text: "Manual & cron triggers" },
      { text: "Community support" },
    ],
    missing: ["BYOK (Bring your own key)", "Human-in-the-loop approvals", "Error prevention (auto)"],
  },
  {
    name: "Solo",
    price: "€9.90",
    yearlyPrice: "€6.90",
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
      { text: "All 12+ connectors" },
      { text: "Bring your own API keys (BYOK)" },
      { text: "30-day run history" },
      { text: "Visual editor + Genesis AI" },
      { text: "Manual, cron & webhook triggers" },
      { text: "Email support" },
    ],
    missing: ["Human-in-the-loop approvals", "Error prevention (auto)"],
  },
  {
    name: "Team",
    price: "€19.90",
    yearlyPrice: "€15.90",
    yearlyBilledAs: "billed annually",
    period: "/ month",
    description: "For teams running automations in production.",
    highlight: true,
    badge: "Most popular",
    socialProof: "Used by teams across 30+ countries",
    features: [
      { text: "Unlimited programs" },
      { text: "Up to 3 team seats" },
      { text: "Human-in-the-loop approvals" },
      { text: "Error prevention (auto)" },
      { text: "500 runs / month — enough for daily automations across your whole team" },
      { text: "All 12+ connectors" },
      { text: "BYOK + Corelyx model credits" },
      { text: "90-day run history" },
      { text: "All trigger types" },
      { text: "Email notifications" },
      { text: "Priority support" },
    ],
    missing: [],
  },
  {
    name: "Scale",
    price: "€49.90",
    yearlyPrice: "€39.90",
    yearlyBilledAs: "billed annually",
    period: "/ month",
    trust: "Cancel anytime · No contracts",
    description: "For agencies and enterprises managing clients at scale.",
    highlight: false,
    features: [
      { text: "Everything in Team" },
      { text: "Unlimited team seats" },
      { text: "2,000 runs / month", note: "(custom available)" },
      { text: "1-year run history" },
      { text: "Priority execution queue" },
      { text: "Dedicated success manager" },
      { text: "Custom integrations on request" },
      { text: "SLA guarantee" },
    ],
    missing: [],
  },
] as const;

export const FAQ = [
  {
    q: "What counts as a run?",
    a: "A run is one full execution of a program — from trigger to completion, regardless of how many nodes it contains.",
  },
  {
    q: "What is BYOK?",
    a: "Bring Your Own Key. You add your own Anthropic, OpenAI, or OpenRouter API key, and model costs go directly to your provider account. Corelyx never marks up model usage.",
  },
  {
    q: "Can I use my own API keys on paid plans?",
    a: "Yes — BYOK works on Solo and above. Team and Scale also include optional Corelyx model credits as a convenience top-up.",
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

export function PricingTiers({ ctas }: { ctas: TierCTA[] }) {
  const [interval, setInterval] = useState<"month" | "year">("year");

  return (
    <div className="space-y-6">
      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-xl border border-border bg-background/50 p-1 gap-1">
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

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
        {TIERS.map((tier, i) => {
          const cta = ctas[i];
          const displayLabel = interval === "year" && cta.labelYear ? cta.labelYear : cta.label;
          const isYearlyPaid = interval === "year" && "yearlyPrice" in tier;
          const displayPrice = isYearlyPaid ? tier.yearlyPrice : tier.price;
          const displayPeriod = isYearlyPaid ? "/ month" : tier.period;
          const billedAs = isYearlyPaid && "yearlyBilledAs" in tier ? tier.yearlyBilledAs : null;
          const roiText = "roiYear" in tier && "roiMonth" in tier
            ? interval === "year" ? tier.roiYear : tier.roiMonth
            : null;

          return (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                tier.highlight
                  ? "border-primary/40 bg-card shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_24px_48px_rgba(0,0,0,0.4)]"
                  : "border-border bg-card"
              }`}
            >
              {tier.highlight && (
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent rounded-t-2xl" />
              )}
              {"badge" in tier && tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-bold text-primary tracking-wide">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="xl:min-h-[168px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">{tier.name}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black">{displayPrice}</span>
                  <span className="text-sm text-muted-foreground">{displayPeriod}</span>
                </div>
                {billedAs && (
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5 mb-1">{billedAs}</p>
                )}
                {roiText && (
                  <p className="text-[11px] font-medium text-green-400/80 mt-1 mb-1">{roiText}</p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">{tier.description}</p>
              </div>

              <div className="flex min-h-[88px] flex-col gap-2">
                {cta.style === "disabled" ? (
                  <span className="w-full text-center rounded-xl px-5 py-3 text-sm font-bold border border-border bg-background/50 opacity-50 cursor-default">
                    {displayLabel}
                  </span>
                ) : cta.checkout ? (
                  <form action="/api/billing/checkout" method="POST">
                    <input type="hidden" name="tier" value={cta.checkout.tier} />
                    <input type="hidden" name="interval" value={interval} />
                    <button
                      type="submit"
                      className={`w-full text-center rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                        cta.style === "primary"
                          ? "bg-primary text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.55)]"
                          : "border border-border bg-background/50 hover:bg-accent hover:border-border/80"
                      }`}
                    >
                      {displayLabel}
                    </button>
                  </form>
                ) : (
                  <Link
                    href={cta.href ?? "/dashboard"}
                    className={`w-full text-center rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                      cta.style === "primary"
                        ? "bg-primary text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.55)]"
                        : "border border-border bg-background/50 hover:bg-accent hover:border-border/80"
                    }`}
                  >
                    {displayLabel}
                  </Link>
                )}
                {"socialProof" in tier && tier.socialProof && (
                  <p className="text-center text-[11px] text-muted-foreground/50">{tier.socialProof}</p>
                )}
                {"trust" in tier && tier.trust && (
                  <p className="text-center text-[11px] text-muted-foreground/40">{tier.trust}</p>
                )}
              </div>

              <div className="space-y-2.5">
                {tier.features.map((f) => (
                  <div key={f.text} className="flex items-start gap-2.5">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-green-400 shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-foreground/80">
                      {f.text}
                      {"note" in f && f.note && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground/50 font-medium">{f.note}</span>
                      )}
                    </span>
                  </div>
                ))}
                {tier.missing.map((f) => (
                  <div key={f} className="flex items-start gap-2.5 opacity-35">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5">
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
