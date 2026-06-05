"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Rocket, Shield, Users, type LucideIcon } from "lucide-react";
import {
  PricingTable,
  PricingTableBody,
  PricingTableCell,
  PricingTableHead,
  PricingTableHeader,
  PricingTablePlan,
  PricingTableRow,
} from "@/components/ui/pricing-table";
import { Button } from "@/components/ui/button";
import { COMPARISON_FEATURES } from "@/lib/pricing-features";
import { cn } from "@/lib/utils";

type Plan = {
  name: string;
  badge: string;
  icon: LucideIcon;
  /** Column index into COMPARISON_FEATURES.values ([Free, Solo, Team, Scale]). */
  col: number;
  price: number;
  yearlyPrice: number;
  yearlyMonthly: number;
  buttonText: string;
  href: string;
  popular?: boolean;
};

const plans: Plan[] = [
  {
    name: "Solo",
    badge: "For individuals",
    icon: Shield,
    col: 1,
    price: 9.9,
    yearlyPrice: 83,
    yearlyMonthly: 6.9,
    buttonText: "Start for €9.90",
    href: "/signup",
  },
  {
    name: "Team",
    badge: "Most popular",
    icon: Users,
    col: 2,
    price: 19.9,
    yearlyPrice: 191,
    yearlyMonthly: 15.9,
    buttonText: "Start with Team",
    href: "/signup",
    popular: true,
  },
  {
    name: "Scale",
    badge: "For agencies",
    icon: Rocket,
    col: 3,
    price: 49.9,
    yearlyPrice: 479,
    yearlyMonthly: 39.9,
    buttonText: "Contact sales",
    href: "mailto:sales@corelyx.app",
  },
];

const eur = (value: number) =>
  `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function BillingToggle({
  isYearly,
  onChange,
}: {
  isYearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  return (
    <div className="bg-muted/60 inline-flex items-center gap-1 rounded-full border p-1">
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
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          isYearly
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Yearly
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-primary">
          2 months free
        </span>
      </button>
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
        <h1 className="text-3xl font-bold text-balance sm:text-5xl">
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

      {/* Comparison table */}
      <PricingTable className="mx-auto my-8 max-w-5xl">
        <PricingTableHeader>
          <PricingTableRow>
            <th />
            {plans.map((plan) => (
              <th key={plan.name} className="p-1">
                <PricingTablePlan
                  name={plan.name}
                  badge={plan.badge}
                  icon={plan.icon}
                  price={isYearly ? eur(plan.yearlyMonthly) : eur(plan.price)}
                  compareAt={isYearly ? eur(plan.price) : undefined}
                  className={
                    plan.popular
                      ? "after:pointer-events-none after:absolute after:-inset-0.5 after:rounded-[inherit] after:bg-gradient-to-b after:from-primary/15 after:to-transparent after:blur-[2px]"
                      : undefined
                  }
                >
                  {isYearly && (
                    <p className="text-muted-foreground mb-3 text-center text-[11px]">
                      {eur(plan.yearlyPrice)} billed annually
                    </p>
                  )}
                  <Button
                    asChild
                    size="lg"
                    variant={plan.popular ? "default" : "outline"}
                    className="w-full rounded-lg"
                  >
                    <Link href={plan.href}>{plan.buttonText}</Link>
                  </Button>
                </PricingTablePlan>
              </th>
            ))}
          </PricingTableRow>
        </PricingTableHeader>
        <PricingTableBody>
          {COMPARISON_FEATURES.map((feature) => (
            <PricingTableRow key={feature.label}>
              <PricingTableHead>{feature.label}</PricingTableHead>
              {plans.map((plan) => (
                <PricingTableCell key={plan.name}>
                  {feature.values[plan.col]}
                </PricingTableCell>
              ))}
            </PricingTableRow>
          ))}
        </PricingTableBody>
      </PricingTable>
    </div>
  );
}
