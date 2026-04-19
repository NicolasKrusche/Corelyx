import Link from "next/link";

export const TIERS = [
  {
    name: "Free",
    price: "£0",
    period: "forever",
    description: "For exploring and building your first automations.",
    highlight: false,
    features: [
      { text: "2 programs", note: "forever" },
      { text: "50 runs / month" },
      { text: "All 12+ connectors" },
      { text: "Bring your own API keys (BYOK)" },
      { text: "7-day run history" },
      { text: "Visual editor + Genesis AI" },
      { text: "Manual & cron triggers" },
      { text: "Community support" },
    ],
    missing: ["Human-in-the-loop approvals", "Conflict detection"],
  },
  {
    name: "Pro",
    price: "£19",
    period: "/ month",
    description: "For teams running automations in production.",
    highlight: true,
    badge: "Most popular",
    features: [
      { text: "Unlimited programs" },
      { text: "500 runs / month" },
      { text: "All 12+ connectors" },
      { text: "BYOK + Nexflow model credits" },
      { text: "90-day run history" },
      { text: "Human-in-the-loop approvals" },
      { text: "Conflict detection" },
      { text: "All trigger types" },
      { text: "Email notifications" },
      { text: "Priority support" },
    ],
    missing: [],
  },
  {
    name: "Builder",
    price: "£59",
    period: "/ month",
    description: "For power users running high-volume, complex pipelines.",
    highlight: false,
    features: [
      { text: "Everything in Pro" },
      { text: "2,000 runs / month" },
      { text: "1-year run history" },
      { text: "Priority execution queue" },
      { text: "Dedicated support" },
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
    a: "Bring Your Own Key. You add your own Anthropic, OpenAI, or OpenRouter API key, and model costs go directly to your provider account. Nexflow never marks up model usage.",
  },
  {
    q: "Can I use my own API keys on paid plans?",
    a: "Yes — BYOK works on all plans. Pro and Builder also include optional Nexflow model credits as a convenience top-up.",
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

type TierCTA = { label: string; href: string; style: "primary" | "border" | "disabled" };

export function PricingTiers({ ctas }: { ctas: TierCTA[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
      {TIERS.map((tier, i) => {
        const cta = ctas[i];
        return (
          <div
            key={tier.name}
            className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
              tier.highlight
                ? "border-primary/40 bg-card shadow-[0_0_0_1px_rgba(249,115,22,0.15),0_24px_48px_rgba(0,0,0,0.4)]"
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

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">{tier.name}</p>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-black">{tier.price}</span>
                <span className="text-sm text-muted-foreground">{tier.period}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{tier.description}</p>
            </div>

            {cta.style === "disabled" ? (
              <span className="w-full text-center rounded-xl px-5 py-3 text-sm font-bold border border-border bg-background/50 opacity-50 cursor-default">
                {cta.label}
              </span>
            ) : (
              <Link
                href={cta.href}
                className={`w-full text-center rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                  cta.style === "primary"
                    ? "bg-primary text-primary-foreground shadow-[0_0_28px_rgba(249,115,22,0.4)] hover:shadow-[0_0_40px_rgba(249,115,22,0.55)]"
                    : "border border-border bg-background/50 hover:bg-accent hover:border-border/80"
                }`}
              >
                {cta.label}
              </Link>
            )}

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
