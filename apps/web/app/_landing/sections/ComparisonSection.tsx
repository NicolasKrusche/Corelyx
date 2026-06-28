"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, GitCompareArrows, Minus } from "lucide-react";
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

const COLUMNS = [
  {
    name: "Generic automation tools",
    highlight: false,
    points: [
      { label: "Good for simple automations", has: true },
      { label: "Focus on speed and connectivity", has: true },
      { label: "Governance is manual or external", has: false },
      { label: "Audit evidence can be fragmented", has: false },
      { label: "Compliance context built in", has: false },
    ],
  },
  {
    name: "Self-hosted tools",
    highlight: false,
    points: [
      { label: "More infrastructure control", has: true },
      { label: "Still requires governance design", has: false },
      { label: "Compliance is not automatic", has: false },
      { label: "You build review + evidence yourself", has: false },
      { label: "Approval gates out of the box", has: false },
    ],
  },
  {
    name: "Corelyx",
    highlight: true,
    points: [
      { label: "Visual builder + validated schema", has: true },
      { label: "Human approval gates", has: true },
      { label: "Credential boundary by design", has: true },
      { label: "GDPR + AI Act workflow controls", has: true },
      { label: "Audit-ready evidence + trust surfaces", has: true },
    ],
  },
] as const;

export function ComparisonSection() {
  return (
    <SectionShell id="compare" glow="brand" className="bg-[#0a0c10] text-white">
      <div className="max-w-3xl">
        <Reveal>
          <Eyebrow icon={<GitCompareArrows className="h-3.5 w-3.5" />}>Where Corelyx fits</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            Not just a no-code canvas. Not just self-hosted automation.
            <br />
            <span className="text-[#f05a28]">A governance layer for AI workflows.</span>
          </h2>
        </Reveal>
      </div>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mt-14 grid gap-4 lg:grid-cols-3"
      >
        {COLUMNS.map((col) => (
          <motion.div
            key={col.name}
            variants={staggerItem}
            className={
              col.highlight
                ? "relative rounded-2xl border border-[#f05a28]/40 bg-gradient-to-b from-[#f05a28]/[0.08] to-transparent p-6 shadow-[0_30px_90px_-30px_rgba(240,90,40,0.45)]"
                : "rounded-2xl border border-white/10 bg-white/[0.015] p-6"
            }
          >
            {col.highlight && (
              <span className="absolute -top-3 left-6 rounded-full bg-[#f05a28] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
                Corelyx
              </span>
            )}
            <h3 className={`text-[15px] font-semibold ${col.highlight ? "text-white" : "text-white/70"}`}>
              {col.name}
            </h3>
            <ul className="mt-5 space-y-3">
              {col.points.map((p) => (
                <li key={p.label} className="flex items-start gap-2.5">
                  {p.has ? (
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${col.highlight ? "text-[#34d399]" : "text-[#34d399]/70"}`} strokeWidth={2.25} />
                  ) : (
                    <Minus className="mt-0.5 h-4 w-4 shrink-0 text-white/25" strokeWidth={2} />
                  )}
                  <span className={`text-[13px] leading-snug ${p.has ? "text-white/75" : "text-white/40"}`}>
                    {p.label}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  );
}
