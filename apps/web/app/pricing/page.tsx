import Link from "next/link";
import type { Metadata } from "next";
import { PricingTiers, PricingFAQ } from "@/components/pricing/pricing-tiers";

export const metadata: Metadata = {
  title: "Pricing — Nexflow",
  description: "Simple, transparent pricing. Start free, upgrade when you're ready.",
};

const PUBLIC_CTAS = [
  { label: "Get started free", href: "/signup", style: "border" as const },
  { label: "Start Pro", href: "/signup?plan=pro", style: "primary" as const },
  { label: "Start Builder", href: "/signup?plan=builder", style: "border" as const },
];

export default function PublicPricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Nexflow" className="h-6 w-6 object-contain" />
            <span className="font-bold text-sm tracking-tight">Nexflow</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <Link href="/#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
            <Link href="/#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="/#integrations" className="hover:text-foreground transition-colors">Integrations</Link>
            <Link href="/pricing" className="text-foreground font-medium">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_28px_rgba(249,115,22,0.45)] transition-all duration-200">
              Get started free
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute inset-0 bg-grid-dots opacity-20" />
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      {/* Hero */}
      <section className="text-center px-6 pt-20 pb-14">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4">Pricing</p>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-4">Simple, honest pricing.</h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Start free. No credit card required. Upgrade when your automations need more.
        </p>
      </section>

      {/* Tiers */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl">
          <PricingTiers ctas={PUBLIC_CTAS} />
        </div>
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          Have a promo or beta code?{" "}
          <Link href="/signup" className="text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
            Sign up
          </Link>{" "}
          and redeem it in Settings.
        </p>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/40 px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-3">FAQ</p>
            <h2 className="text-3xl font-black tracking-tight">Common questions</h2>
          </div>
          <PricingFAQ />
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 border-t border-border/40">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-black tracking-tight mb-3">Ready to automate?</h2>
          <p className="text-muted-foreground text-sm mb-8">Free to start. No credit card required. Your first two programs are on us.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:shadow-[0_0_56px_rgba(249,115,22,0.65)] transition-all duration-300">
            Get started free
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/50">
          <span>© {new Date().getFullYear()} Nexflow. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-foreground transition-colors font-medium text-muted-foreground/70">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
