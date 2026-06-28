"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  FileCheck2,
  GitBranch,
  Lock,
  UserCheck,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

const LAYERS = [
  {
    n: "01",
    icon: GitBranch,
    title: "Visual workflow design",
    body: "Build agent programs from triggers, model calls, conditions, and actions on a canvas anyone can read.",
  },
  {
    n: "02",
    icon: Boxes,
    title: "Validated execution schema",
    body: "Every canvas compiles to a versioned, validated schema — the contract the runtime actually executes.",
  },
  {
    n: "03",
    icon: UserCheck,
    title: "Human approval gates",
    body: "Sensitive steps pause for review. Nothing high-impact runs without an accountable decision.",
  },
  {
    n: "04",
    icon: Lock,
    title: "Secure credential boundary",
    body: "Secrets are resolved server-side through trusted helpers — never exposed to the browser or AI steps.",
  },
  {
    n: "05",
    icon: FileCheck2,
    title: "Audit-ready evidence",
    body: "Runs, approvals, and policy checks become a searchable record you can export for review.",
  },
] as const;

export function OperatingModelSection() {
  return (
    <SectionShell id="platform" glow="brand" className="bg-[#07080a] text-white">
      <div className="max-w-3xl">
        <Reveal>
          <Eyebrow icon={<Boxes className="h-3.5 w-3.5" />}>The Corelyx operating model</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            A visual workflow builder is only the beginning.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
            Corelyx connects the workflow canvas, a validated execution schema,
            approval gates, credential boundaries, and audit evidence into one
            compliance-first operating model.
          </p>
        </Reveal>
      </div>

      {/* Five connected layers */}
      <motion.ol
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="relative mt-16 grid gap-4 md:grid-cols-5"
      >
        {/* connective spine on desktop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 top-[34px] hidden h-px bg-gradient-to-r from-transparent via-[#f05a28]/40 to-transparent md:block"
        />
        {LAYERS.map((layer) => {
          const Icon = layer.icon;
          return (
            <motion.li
              key={layer.n}
              variants={staggerItem}
              className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[#f05a28]/40"
            >
              <div className="relative z-10 mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-xl border border-white/10 bg-[#0d0f14] text-[#f05a28] shadow-[0_8px_24px_-12px_rgba(240,90,40,0.6)] transition-colors group-hover:border-[#f05a28]/40">
                <Icon className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <span className="font-mono text-[11px] tracking-widest text-white/30">{layer.n}</span>
              <h3 className="mt-1 text-[15px] font-semibold leading-snug">{layer.title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-white/45">{layer.body}</p>
            </motion.li>
          );
        })}
      </motion.ol>

      <Reveal delay={0.1}>
        <p className="mt-12 font-mono text-sm text-white/40">
          <span className="text-[#f05a28]">{"// "}</span>
          From a pretty graph to a governed system.
        </p>
      </Reveal>
    </SectionShell>
  );
}
