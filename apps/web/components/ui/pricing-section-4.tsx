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
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Starter",
    description: "Great for testing AI workflows and running your first programs",
    price: 12,
    yearlyPrice: 99,
    buttonText: "Get started",
    href: "/signup",
    buttonVariant: "outline" as const,
    includes: [
      "Starter includes:",
      "2 active programs",
      "Manual runs",
      "Visual editor",
      "Run history",
      "Secure API keys",
      "Community support",
      "Public templates",
    ],
  },
  {
    name: "Business",
    description: "Best value for teams that need scheduled runs and approvals",
    price: 48,
    yearlyPrice: 399,
    buttonText: "Get started",
    href: "/signup",
    buttonVariant: "default" as const,
    popular: true,
    includes: [
      "Everything in Starter, plus:",
      "25 active programs",
      "Scheduled and webhook runs",
      "Human approvals",
      "Live execution logs",
      "Priority support",
      "Advanced run policies",
      "Team-ready workflows",
    ],
  },
  {
    name: "Enterprise",
    description: "Advanced plan with enhanced controls for larger teams",
    price: 96,
    yearlyPrice: 899,
    buttonText: "Contact sales",
    href: "mailto:sales@corelyx.systems",
    buttonVariant: "outline" as const,
    includes: [
      "Everything in Business, plus:",
      "Unlimited programs",
      "Shared connections",
      "Audit-friendly logs",
      "Attachment permissions",
      "Dedicated onboarding",
      "Custom limits",
      "Security review support",
    ],
  },
];

const PricingSwitch = ({ onSwitch, accentColor }: { onSwitch: (value: string) => void; accentColor: string }) => {
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
              className={cn(
                "absolute left-0 top-0 h-10 w-full rounded-full border-4 bg-gradient-to-t shadow-sm",
                accentColor === "orange"
                  ? "border-orange-600 from-orange-500 to-orange-600 shadow-orange-600"
                  : "border-blue-600 from-blue-500 to-blue-600 shadow-blue-600"
              )}
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
              className={cn(
                "absolute left-0 top-0 h-10 w-full rounded-full border-4 bg-gradient-to-t shadow-sm",
                accentColor === "orange"
                  ? "border-orange-600 from-orange-500 to-orange-600 shadow-orange-600"
                  : "border-blue-600 from-blue-500 to-blue-600 shadow-blue-600"
              )}
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

  // Orange for logged out, blue for logged in
  const accentColor = isLoggedIn ? "blue" : "orange";
  const accentGradient =
    accentColor === "orange"
      ? "radial-gradient(circle at center, #ea580c 0%, transparent 70%)"
      : "radial-gradient(circle at center, #206ce8 0%, transparent 70%)";
  const accentBorder = accentColor === "orange" ? "#ea580c" : "#3131f5";
  const accentShadow = accentColor === "orange" ? "shadow-[0px_-13px_300px_0px_#ea580c]" : "shadow-[0px_-13px_300px_0px_#0900ff]";

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
        className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)]"
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]" />
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
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
          Choose the plan that matches how many workflows you want Corelyx to
          run, monitor, and scale.
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <PricingSwitch onSwitch={togglePricingPeriod} accentColor={accentColor} />
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
                "relative h-full border-neutral-800 text-white",
                plan.popular
                  ? cn(
                      "z-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900",
                      accentShadow
                    )
                  : "z-10 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900"
              )}
            >
              <CardHeader className="text-left">
                <div className="flex justify-between">
                  <h2 className="mb-2 text-3xl">{plan.name}</h2>
                  {plan.popular && (
                    <span
                      className={cn(
                        "h-fit rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                        accentColor === "orange"
                          ? "border border-orange-500/40 bg-orange-500/10 text-orange-200"
                          : "border border-blue-500/40 bg-blue-500/10 text-blue-200"
                      )}
                    >
                      Popular
                    </span>
                  )}
                </div>
                <div className="flex items-baseline">
                  <span className="text-4xl font-semibold">
                    $
                    <NumberFlow
                      format={{ maximumFractionDigits: 0 }}
                      value={isYearly ? plan.yearlyPrice : plan.price}
                      className="text-4xl font-semibold"
                    />
                  </span>
                  <span className="ml-1 text-gray-300">
                    /{isYearly ? "year" : "month"}
                  </span>
                </div>
                <p className="mb-4 text-sm text-gray-300">{plan.description}</p>
              </CardHeader>

              <CardContent className="pt-0">
                <Link
                  href={plan.href}
                  className={cn(
                    "mb-6 inline-flex w-full items-center justify-center rounded-xl p-4 text-xl transition-opacity hover:opacity-90",
                    plan.popular
                      ? accentColor === "orange"
                        ? "border border-orange-500 bg-gradient-to-t from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-800"
                        : "border border-blue-500 bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-800"
                      : plan.buttonVariant === "outline"
                        ? "border border-neutral-800 bg-gradient-to-t from-neutral-950 to-neutral-600 text-white shadow-lg shadow-neutral-900"
                        : ""
                  )}
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
