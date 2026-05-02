import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PricingTiers, PricingFAQ } from "@/components/pricing/pricing-tiers";

export const metadata: Metadata = {
  title: "Pricing — Corelyx",
};

export default async function PricingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();
  const currentTier = ((profile as { tier?: string } | null)?.tier ?? "free") as string;

  const tierOrder = ["free", "plus", "pro", "builder"];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  const ctas = [
    {
      label: currentTier === "free" ? "Current plan" : "Downgrade",
      href: "/dashboard",
      style: (currentTier === "free" ? "disabled" : "border") as "disabled" | "border",
    },
    {
      label: currentTier === "plus" ? "Current plan" : currentTierIndex > 1 ? "Downgrade" : "Start for €9.90",
      labelYear: currentTier === "plus" || currentTierIndex > 1 ? undefined : "Start for €6.90/mo",
      checkout: currentTier !== "plus" && currentTierIndex <= 1 ? { tier: "plus" as const, interval: "month" as const } : undefined,
      href: currentTier === "plus" || currentTierIndex > 1 ? "/dashboard" : undefined,
      style: (currentTier === "plus" ? "disabled" : "border") as "disabled" | "border",
    },
    {
      label: currentTier === "pro" ? "Current plan" : currentTierIndex > 2 ? "Downgrade" : "Start with Team",
      checkout: currentTier !== "pro" && currentTierIndex <= 2 ? { tier: "pro" as const, interval: "month" as const } : undefined,
      href: currentTier === "pro" || currentTierIndex > 2 ? "/dashboard" : undefined,
      style: (currentTier === "pro" ? "disabled" : "primary") as "disabled" | "primary",
    },
    {
      label: currentTier === "builder" ? "Current plan" : "Contact sales",
      href: currentTier === "builder" ? "/dashboard" : "mailto:sales@corelyx.app",
      style: (currentTier === "builder" ? "disabled" : "border") as "disabled" | "border",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Pricing</p>
        <h1 className="text-3xl font-black tracking-tight">Simple, honest pricing.</h1>
        <p className="text-muted-foreground text-sm mt-1">Start free. No credit card required. Upgrade when the limits hurt.</p>
      </div>

      <PricingTiers ctas={ctas} enterpriseCta={{ label: "Talk to us", href: "mailto:enterprise@corelyx.app" }} />

      {/* FAQ */}
      <div className="border-t border-border/40 pt-10">
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">FAQ</p>
          <h2 className="text-2xl font-black tracking-tight">Common questions</h2>
        </div>
        <div className="max-w-2xl">
          <PricingFAQ />
        </div>
      </div>
    </div>
  );
}
