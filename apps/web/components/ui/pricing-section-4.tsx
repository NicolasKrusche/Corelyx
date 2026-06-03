"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sparkles as SparklesComp } from "@/components/ui/sparkles";
import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Solo",
    description: "For individuals who need more runs and no program limits.",
    price: 9.9,
    yearlyPrice: 83,
    yearlyMonthly: 6.9,
    buttonText: "Start for €9.90",
    href: "/signup",
    buttonVariant: "outline" as const,
    includes: [
      "Solo includes:",
      "5 programs",
      "75 runs / month",
      "All 200+ connectors (incl. Stripe, Twilio, OpenAI…)",
      "BYOK (bring your own API key)",
      "2,500 platform AI credits / month",
      "30-day run history",
      "Webhook triggers",
      "Email support",
    ],
  },
  {
    name: "Team",
    description: "For teams running automations in production.",
    price: 19.9,
    yearlyPrice: 191,
    yearlyMonthly: 15.9,
    buttonText: "Start with Team",
    href: "/signup",
    buttonVariant: "default" as const,
    popular: true,
    includes: [
      "Everything in Solo, plus:",
      "Unlimited programs",
      "Up to 3 team seats",
      "Human-in-the-loop approvals",
      "Error prevention (auto)",
      "500 runs / month",
      "10,000 platform AI credits / month",
      "90-day run history",
      "All trigger types",
      "Priority support",
    ],
  },
  {
    name: "Scale",
    description: "For agencies and enterprises managing clients at scale.",
    price: 49.9,
    yearlyPrice: 479,
    yearlyMonthly: 39.9,
    buttonText: "Contact sales",
    href: "mailto:sales@corelyx.app",
    buttonVariant: "outline" as const,
    includes: [
      "Everything in Team, plus:",
      "Unlimited team seats",
      "2,000 runs / month",
      "15,000 platform AI credits / month",
      "1-year run history",
      "Priority execution queue",
      "Dedicated success manager",
      "Custom integrations",
      "SLA guarantee",
    ],
  },
];

const PricingSwitch = ({ onSwitch }: { onSwitch: (value: string) => void }) => {
  const [selected, setSelected] = useState("0");

  const handleSwitch = (value: string) => {
    setSelected(value);
    onSwitch(value);
  };

  return (
    <div className="flex justify-center">
      <div className="relative z-10 mx-auto flex w-fit rounded-full border border-gray-700 bg-neutral-900 p-1">
        <button
          type="button"
          onClick={() => handleSwitch("0")}
          className={cn(
            "relative z-10 h-10 w-fit rounded-full px-3 py-1 font-medium transition-colors sm:px-6 sm:py-2",
            selected === "0" ? "text-white" : "text-gray-200"
          )}
        >
          {selected === "0" && (
            <motion.span
              layoutId="switch"
              className="absolute left-0 top-0 h-10 w-full rounded-full border-[3px]"
              style={{
                borderColor: "hsl(var(--primary) / 0.9)",
                background: "linear-gradient(to top, hsl(var(--primary) / 0.9), hsl(var(--primary)))",
                boxShadow: "0 0 18px hsl(var(--primary) / 0.45)",
              }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Monthly</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitch("1")}
          className={cn(
            "relative z-10 h-10 w-fit flex-shrink-0 rounded-full px-3 py-1 font-medium transition-colors sm:px-6 sm:py-2",
            selected === "1" ? "text-white" : "text-gray-200"
          )}
        >
          {selected === "1" && (
            <motion.span
              layoutId="switch"
              className="absolute left-0 top-0 h-10 w-full rounded-full border-[3px]"
              style={{
                borderColor: "hsl(var(--primary) / 0.9)",
                background: "linear-gradient(to top, hsl(var(--primary) / 0.9), hsl(var(--primary)))",
                boxShadow: "0 0 18px hsl(var(--primary) / 0.45)",
              }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-2">Yearly</span>
        </button>
      </div>
    </div>
  );
};

export default function PricingSection4({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isYearly, setIsYearly] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { base } = useTheme();

  const accentGradient = "radial-gradient(circle at center, hsl(var(--primary)) 0%, transparent 70%)";
  const accentBorder = "hsl(var(--primary) / 0.15)";
  const cardBg = base === "dark"
    ? "bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900"
    : "bg-gradient-to-r from-white via-slate-100 to-white";
  const cardBorder = base === "dark" ? "border-neutral-800 text-white" : "border-border text-foreground";
  const buttonOutline = base === "dark"
    ? "border border-neutral-700 bg-gradient-to-t from-neutral-950 to-neutral-700 text-white shadow-lg shadow-neutral-900"
    : "border border-border bg-gradient-to-t from-background to-card text-foreground shadow";

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: i * 0.22,
        duration: 0.5,
      },
    }),
    hidden: {
      filter: "blur(10px)",
      y: -20,
      opacity: 0,
    },
  };

  const togglePricingPeriod = (value: string) =>
    setIsYearly(Number.parseInt(value, 10) === 1);

  return (
    <div
      className="relative mx-auto min-h-screen overflow-x-hidden bg-black pb-16"
      ref={pricingRef}
    >
      {/* Header with Navigation */}
      <div className="relative z-50 flex items-center justify-between px-6 pt-6">
        {isLoggedIn ? (
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        ) : (
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-300 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        )}
      </div>

      <TimelineContent
        animationNum={4}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(closest-side_at_50%_50%,white,transparent)]"
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]" />
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(closest-side_at_50%_50%,white,transparent_85%)]"
        />
      </TimelineContent>

      <TimelineContent
        animationNum={5}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute left-0 top-[-114px] z-0 flex h-[113.625vh] w-full flex-none flex-col content-start items-start justify-start gap-2.5 overflow-hidden p-0"
      >
        <div>
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: `200px solid ${accentBorder}`,
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
            data-border="true"
            data-framer-name="Ellipse 1"
          />
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: `200px solid ${accentBorder}`,
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
            data-border="true"
            data-framer-name="Ellipse 2"
          />
        </div>
      </TimelineContent>

      <article className="relative z-50 mx-auto mb-6 max-w-3xl space-y-2 px-6 pt-32 text-center">
        <h1 className="text-4xl font-medium text-white sm:text-5xl">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.15}
            staggerFrom="first"
            reverse
            containerClassName="justify-center"
            transition={{
              type: "spring",
              stiffness: 250,
              damping: 40,
              delay: 0,
            }}
          >
            Plans that work best for your automations
          </VerticalCutReveal>
        </h1>

        <TimelineContent
          as="p"
          animationNum={0}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="text-gray-300"
        >
          Start free — no credit card required. Upgrade when the limits hurt.
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <PricingSwitch onSwitch={togglePricingPeriod} />
        </TimelineContent>
      </article>

      <div
        className="absolute left-[10%] right-[10%] top-0 z-0 h-full w-[80%]"
        style={{
          backgroundImage: accentGradient,
          opacity: 0.6,
          mixBlendMode: "multiply",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-5xl gap-4 px-4 py-6 md:grid-cols-3">
        {plans.map((plan, index) => (
          <TimelineContent
            key={plan.name}
            as="div"
            animationNum={2 + index}
            timelineRef={pricingRef}
            customVariants={revealVariants}
          >
            <Card
              className={cn(
                "relative h-full",
                cardBorder,
                plan.popular
                  ? cn(
                      "z-20",
                      cardBg
                    )
                  : cn("z-10", cardBg)
              )}
              style={plan.popular ? { boxShadow: "0 -13px 200px 0 hsl(var(--primary) / 0.45)" } : undefined}
            >
              <CardHeader className="text-left">
                <div className="flex justify-between">
                  <h2 className="mb-2 text-3xl">{plan.name}</h2>
                  {plan.popular && (
                    <span
                      className="h-fit rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        border: "1px solid hsl(var(--primary) / 0.4)",
                        background: "hsl(var(--primary) / 0.12)",
                        color: base === "dark" ? "hsl(var(--foreground))" : "hsl(var(--foreground))",
                      }}
                    >
                      Popular
                    </span>
                  )}
                </div>
                <div className="flex items-baseline">
                  <span className="text-4xl font-semibold">
                    €
                    <NumberFlow
                      format={{ maximumFractionDigits: 2 }}
                      value={isYearly ? plan.yearlyMonthly : plan.price}
                      className="text-4xl font-semibold"
                    />
                  </span>
                  <span className="ml-1 text-gray-300">/ month</span>
                </div>
                {isYearly && (
                  <p className="text-[11px] text-gray-400">€{plan.yearlyPrice} billed annually</p>
                )}
                <p className="mb-4 text-sm text-gray-300">{plan.description}</p>
              </CardHeader>

              <CardContent className="pt-0">
                <Link
                  href={plan.href}
                  className={cn(
                    "mb-6 inline-flex w-full items-center justify-center rounded-xl p-4 text-xl transition-opacity hover:opacity-90",
                    plan.popular
                      ? "text-primary-foreground"
                      : plan.buttonVariant === "outline"
                        ? buttonOutline
                        : ""
                  )}
                  style={
                    plan.popular
                      ? {
                          border: "1px solid hsl(var(--primary) / 0.75)",
                          background: "linear-gradient(to top, hsl(var(--primary) / 0.88), hsl(var(--primary)))",
                          boxShadow: "0 12px 28px hsl(var(--primary) / 0.4)",
                        }
                      : undefined
                  }
                >
                  {plan.buttonText}
                </Link>

                <div className="space-y-3 border-t border-neutral-700 pt-4">
                  <h3 className="mb-3 text-base font-medium">
                    {plan.includes[0]}
                  </h3>
                  <ul className="space-y-2">
                    {plan.includes.slice(1).map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <span className="grid h-2.5 w-2.5 place-content-center rounded-full bg-neutral-500" />
                        <span className="text-sm text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TimelineContent>
        ))}
      </div>
    </div>
  );
}
