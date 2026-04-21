import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PricingTiers, PricingFAQ } from "@/components/pricing/pricing-tiers";

export const metadata: Metadata = {
  title: "Pricing — Nexflow",
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
  const currentTier = (profile?.tier ?? "free") as string;

  const ctas = [
    {
      label: currentTier === "free" ? "Current plan" : "Downgrade",
      href: "/dashboard",
      style: (currentTier === "free" ? "disabled" : "border") as "disabled" | "border",
    },
    {
      label: currentTier === "pro" ? "Current plan" : "Upgrade",
      href: "/settings#redeem",
      style: (currentTier === "pro" ? "disabled" : "primary") as "disabled" | "primary",
    },
    {
      label: currentTier === "builder" ? "Current plan" : "Upgrade",
      href: "/settings#redeem",
      style: (currentTier === "builder" ? "disabled" : "border") as "disabled" | "border",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Pricing</p>
        <h1 className="text-3xl font-black tracking-tight">Simple, honest pricing.</h1>
        <p className="text-muted-foreground text-sm mt-1">Start free. No credit card required. Upgrade when your automations need more.</p>
      </div>

      <PricingTiers ctas={ctas} />

      <p className="text-xs text-muted-foreground/50">
        Have a promo or beta code?{" "}
        <Link href="/settings#redeem" className="text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
          Redeem it in Settings.
        </Link>
      </p>

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
