"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Reveal } from "./shared";

// The journey, now resolved: signal → graph → approval → runtime → evidence.
const FLOW = ["Signal", "Graph", "Policy", "Approval", "Runtime", "Evidence"] as const;

export function FinalCtaSection() {
  const reduce = useReducedMotion();
  return (
    <section
      id="get-started"
      className="relative overflow-hidden bg-[#050608] px-5 py-28 text-white sm:px-8 sm:py-36"
    >
      {/* calm glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f05a28]/[0.1] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* resolved flow */}
        <Reveal>
          <div className="mx-auto mb-12 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-3">
            {FLOW.map((node, i) => (
              <React.Fragment key={node}>
                <motion.span
                  className="rounded-full border border-[#f05a28]/25 bg-[#f05a28]/[0.06] px-3 py-1 font-mono text-[11px] tracking-wide text-[#ffb799]"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  {node}
                </motion.span>
                {i < FLOW.length - 1 && (
                  <motion.span
                    aria-hidden="true"
                    className="h-px w-5 bg-gradient-to-r from-[#f05a28]/50 to-[#f05a28]/20"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 + 0.05 }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Build AI workflows
            <br />
            your team can trust.
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg">
            Design, review, and run compliance-first automations with approval
            gates, credential boundaries, and audit-ready execution evidence.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f05a28] px-7 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/security"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 px-7 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white sm:w-auto"
            >
              <ShieldCheck className="h-4 w-4" />
              View security architecture
            </Link>
            <Link
              href="/templates"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 px-7 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white sm:w-auto"
            >
              <Workflow className="h-4 w-4" />
              Workflow templates
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.25}>
          <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.2em] text-white/30">
            EU-hosted · Free plan · No credit card
          </p>
        </Reveal>
      </div>
    </section>
  );
}
