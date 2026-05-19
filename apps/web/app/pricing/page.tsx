import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import PricingSection4 from "@/components/ui/pricing-section-4";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Corelyx AI workflow automation. Free plan available. Paid plans unlock higher run limits, priority support, and GDPR compliance features.",
  alternates: { canonical: "https://corelyx.app/pricing" },
  openGraph: { url: "https://corelyx.app/pricing" },
};

export default async function PricingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PricingSection4 isLoggedIn={!!user} />;
}
