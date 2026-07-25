"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Rocket,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  PricingTable,
  PricingTableBody,
  PricingTableCell,
  PricingTableHead,
  PricingTableHeader,
  PricingTableRow,
} from "@/components/ui/pricing-table";
import { Button } from "@/components/ui/button";
import { CINE_TITLE, CineEyebrow } from "@/components/cinematic";
import { COMPARISON_FEATURES } from "@/lib/pricing-features";
import { PLAN_PRICING, formatEur, type PlanKey } from "@/lib/pricing-plans";
import { PricingFAQ } from "@/components/pricing/pricing-tiers";
import { cn } from "@/lib/utils";

type Plan = {
  key: PlanKey;
  name: string;
  badge: string;
  icon: LucideIcon;
  tagline: string;
  /** Column index into COMPARISON_FEATURES.values ([Free, Solo, Team, Scale]). */
  col: number;
  price: number;
  yearlyPrice: number;
  yearlyMonthly: number;
  buttonText: string;
  href: string;
  highlights: string[];
  popular?: boolean;
};

const plans: Plan[] = [
  {
    key: "free",
    ...PLAN_PRICING.free,
    icon: Sparkles,
    tagline: "Test the waters, no card required.",
    col: 0,
    buttonText: "Start for free",
    href: "/signup",
    highlights: ["2 programs", "50 runs / month", "150+ standard connectors", "Human-in-the-loop approvals", "Community support"],
  },
  {
    key: "plus",
    ...PLAN_PRICING.plus,
    icon: Shield,
    tagline: "More runs, every connector, no limits on programs.",
    col: 1,
    buttonText: `Start for ${formatEur(PLAN_PRICING.plus.price)}`,
    href: "/signup",
    highlights: ["5 programs", "All 200+ connectors", "AI agents & BYOK", "Human-in-the-loop approvals", "2,500 platform AI credits"],
  },
  {
    key: "pro",
    ...PLAN_PRICING.pro,
    icon: Users,
    tagline: "Ship automations in production, together.",
    col: 2,
    buttonText: "Start with Team",
    href: "/signup",
    highlights: ["Unlimited programs", "Up to 3 team seats", "Approvals & conflict handling", "500 runs / month"],
    popular: true,
  },
  {
    key: "builder",
    ...PLAN_PRICING.builder,
    icon: Rocket,
    tagline: "Priority infrastructure for high-volume teams.",
    col: 3,
    buttonText: "Contact sales",
    href: "mailto:sales@corelyx.app",
    highlights: ["Unlimited seats", "2,000 runs / month", "Dedicated success manager", "Uptime target with SLA credits"],
  },
];

const eur = formatEur;

function BillingToggle({
  isYearly,
  onChange,
}: {
  isYearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  return (
    <div className="bg-muted/60 inline-flex items-center gap-1 rounded-full border border-border p-1">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          !isYearly
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-label="Yearly (save up to 30%)"
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          isYearly
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Yearly
        <span
          aria-hidden="true"
          className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-primary"
        >
          save up to 30%
        </span>
      </button>
    </div>
  );
}

function PlanCard({ plan, isYearly }: { plan: Plan; isYearly: boolean }) {
  const Icon = plan.icon;
  const displayPrice = isYearly ? eur(plan.yearlyMonthly) : eur(plan.price);
  const buttonText = plan.buttonText.startsWith("Start for ")
    ? `Start for ${displayPrice}`
    : plan.buttonText;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl border p-6 backdrop-blur-xs transition-all duration-200",
        plan.popular
          ? "border-primary/40 bg-background/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_24px_60px_-20px_hsl(var(--primary)/0.35)] md:-translate-y-3"
          : "border-border bg-background/40 hover:border-border/80 hover:bg-background/60",
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.5)]">
          Most popular
        </span>
      )}

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
            plan.popular ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-mono text-sm font-semibold">{plan.name}</h3>
          <p className="text-muted-foreground text-[11px]">{plan.badge}</p>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 min-h-[2.5rem] text-sm">{plan.tagline}</p>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-black tracking-tight">{displayPrice}</span>
        {plan.price > 0 && <span className="text-muted-foreground text-sm">/ mo</span>}
      </div>
      <p className="text-muted-foreground/70 mt-1 h-4 text-[11px]">
        {isYearly && plan.price > 0 ? `${eur(plan.yearlyPrice)} billed annually` : plan.price > 0 ? "billed monthly" : "no credit card required"}
      </p>

      <Button
        asChild
        size="lg"
        variant={plan.popular ? "default" : "outline"}
        className={cn("mt-5 w-full rounded-lg", plan.popular && "shadow-[0_0_28px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.55)]")}
      >
        <Link href={plan.href}>{buttonText}</Link>
      </Button>

      {plan.price > 0 && (
        <p className="text-muted-foreground/60 mt-2 text-center text-[11px]">
          Renews {isYearly ? "annually" : "monthly"} until cancelled
        </p>
      )}

      <ul className="mt-6 space-y-2.5 border-t border-border/60 pt-5">
        {plan.highlights.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-foreground/80">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingSection4({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isYearly, setIsYearly] = useState(false);
  const router = useRouter();

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:py-16">
      {/* Dotted radial backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 z-[-10] size-full max-h-[640px] opacity-50",
          "[mask-image:radial-gradient(ellipse_at_center,var(--background),transparent)]",
        )}
        style={{
          backgroundImage: "radial-gradient(var(--foreground) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Back navigation */}
      <div className="relative z-10 mx-auto mb-6 flex max-w-5xl items-center">
        {isLoggedIn ? (
          <button
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        )}
      </div>

      {/* Heading */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <CineEyebrow>Pricing</CineEyebrow>
        <h1 className={cn(CINE_TITLE, "mt-3 text-3xl text-balance sm:text-5xl")}>
          {"Plans that work best for your "}
          <i className="from-primary via-primary to-amber-400 bg-gradient-to-r bg-clip-text font-serif font-extrabold text-transparent drop-shadow-[0_0_18px_hsl(var(--primary)/0.45)]">
            automations
          </i>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-pretty">
          Start free — no credit card required. Upgrade when the limits hurt.
        </p>
        <div className="mt-6">
          <BillingToggle isYearly={isYearly} onChange={setIsYearly} />
        </div>
      </div>

      {/* Plan cards */}
      <div className="relative z-10 mx-auto mt-10 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} isYearly={isYearly} />
        ))}
      </div>

      {/* Full comparison table */}
      <div className="relative z-10 mx-auto mt-16 max-w-5xl">
        <details className="group">
          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Compare every feature in detail
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
            >
              <path
                fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </summary>
          <div className="mt-6">
            <p className="text-muted-foreground/60 mb-2 text-center text-[11px] sm:hidden">
              Scroll sideways to compare plans →
            </p>
            <PricingTable>
              <PricingTableHeader>
                <PricingTableRow>
                  <th />
                  {plans.map((plan) => (
                    <PricingTableHead key={plan.name} className="text-foreground text-center font-semibold">
                      {plan.name}
                    </PricingTableHead>
                  ))}
                </PricingTableRow>
              </PricingTableHeader>
              <PricingTableBody>
                {COMPARISON_FEATURES.map((feature) => (
                  <PricingTableRow key={feature.label}>
                    <PricingTableHead>{feature.label}</PricingTableHead>
                    {plans.map((plan) => (
                      <PricingTableCell key={plan.name} className="text-center">
                        {feature.values[plan.col]}
                      </PricingTableCell>
                    ))}
                  </PricingTableRow>
                ))}
              </PricingTableBody>
            </PricingTable>
          </div>
        </details>
      </div>

      {/* FAQ */}
      <div className="relative z-10 mx-auto mt-16 max-w-2xl">
        <h2 className="text-center text-xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="mt-6">
          <PricingFAQ />
        </div>
      </div>
    </div>
  );
}
