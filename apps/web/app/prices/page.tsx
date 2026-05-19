import type { Metadata } from "next";
import { redirect } from "next/navigation";

// /prices is an alias redirect to /pricing.
// Exclude from index to avoid duplicate-content signals;
// canonical is /pricing.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PricesPage() {
  redirect("/pricing");
}
