"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Eye,
  FileBadge,
  Minimize2,
  Scale,
  ScrollText,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

const CHECKPOINTS = [
  { icon: Minimize2, title: "Data minimisation", body: "Capture only what a step needs — and flag fields that shouldn't flow downstream." },
  { icon: Scale, title: "Lawful basis context", body: "Attach the processing basis to workflows that handle personal data." },
  { icon: ClipboardCheck, title: "DSAR workflow support", body: "Structure subject-request handling with steps, ownership, and review." },
  { icon: Timer, title: "Retention settings", body: "Define how long run data and payloads are kept, per workflow." },
  { icon: TriangleAlert, title: "AI risk metadata", body: "Classify each workflow's risk and surface the controls it needs." },
  { icon: Eye, title: "Human oversight", body: "Require review gates on high-impact, customer-facing steps." },
  { icon: ScrollText, title: "Transparency notices", body: "Document where and how AI is involved in a process." },
  { icon: FileBadge, title: "Documentation exports", body: "Generate documentation-ready records from real execution." },
] as const;

export function GovernanceSection() {
  return (
    <SectionShell id="compliance" glow="brand" className="bg-[#07080a] text-white">
      <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow icon={<Scale className="h-3.5 w-3.5" />}>GDPR &amp; EU AI Act workflows</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Compliance should be part of the workflow, not an afterthought.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
              Corelyx helps teams attach governance context to AI automations:
              data minimisation, retention logic, approval checkpoints, risk
              metadata, transparency notes, and documentation-ready execution
              records.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <div className="flex gap-2">
            <span className="rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#a5e3ff]">
              GDPR
            </span>
            <span className="rounded-full border border-[#f05a28]/30 bg-[#f05a28]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#ffb799]">
              EU AI Act
            </span>
          </div>
        </Reveal>
      </div>

      <motion.ul
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {CHECKPOINTS.map((c) => {
          const Icon = c.icon;
          return (
            <motion.li
              key={c.title}
              variants={staggerItem}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[#34d399]/35"
            >
              {/* checkpoint lock marker turns green on hover */}
              <div className="mb-4 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#0d0f14] text-[#f05a28] transition-colors group-hover:text-[#34d399]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#f5b14c] transition-colors group-hover:bg-[#34d399] group-hover:shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </div>
              <h3 className="text-[14px] font-semibold leading-snug">{c.title}</h3>
              <p className="mt-2 text-[12.5px] leading-6 text-white/45">{c.body}</p>
            </motion.li>
          );
        })}
      </motion.ul>

      <Reveal delay={0.1}>
        <p className="mt-12 max-w-2xl font-mono text-[12px] leading-6 text-white/35">
          Corelyx provides workflow controls and reviewable evidence — it does not
          replace legal advice or guarantee compliance on its own.
        </p>
      </Reveal>
    </SectionShell>
  );
}
