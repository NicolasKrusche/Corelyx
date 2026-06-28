"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  EyeOff,
  FileWarning,
  KeyRound,
  ShieldAlert,
  Timer,
  Unplug,
  UserX,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

const RISKS = [
  { icon: EyeOff, label: "Unreviewed AI output", tone: "amber" },
  { icon: KeyRound, label: "Exposed credentials", tone: "red" },
  { icon: UserX, label: "Missing approval", tone: "amber" },
  { icon: FileWarning, label: "No audit trail", tone: "red" },
  { icon: Timer, label: "Unclear data retention", tone: "amber" },
  { icon: ShieldAlert, label: "Weak governance metadata", tone: "amber" },
  { icon: Unplug, label: "Unverified webhooks", tone: "red" },
  { icon: AlertTriangle, label: "Hard-to-review changes", tone: "amber" },
] as const;

const toneClasses: Record<string, string> = {
  amber: "text-[#f5b14c] border-[#f5b14c]/25 group-hover:border-[#f5b14c]/50",
  red: "text-[#f0563f] border-[#f0563f]/25 group-hover:border-[#f0563f]/50",
};

export function ProblemSection() {
  return (
    <SectionShell id="problem" glow="amber" className="bg-[#08090d] text-white">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        {/* Narrative */}
        <div>
          <Reveal>
            <Eyebrow tone="amber" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
              The risk of speed
            </Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              AI automation can move fast.
              <br />
              <span className="text-white/45">Sometimes too fast.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg">
              When workflows touch personal data, customer-impacting actions, or
              third-party systems, speed alone is not enough.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-white/45">
              Teams need to know what ran, who approved it, which credentials were
              used, and what evidence remains.
            </p>
          </Reveal>
        </div>

        {/* Risk cards */}
        <motion.ul
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-2 gap-3 sm:gap-4"
        >
          {RISKS.map((risk) => {
            const Icon = risk.icon;
            return (
              <motion.li
                key={risk.label}
                variants={staggerItem}
                className={`group flex items-center gap-3 rounded-xl border bg-white/[0.02] px-3.5 py-3.5 transition-colors ${toneClasses[risk.tone]}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="text-[13px] font-medium leading-snug text-white/75">
                  {risk.label}
                </span>
              </motion.li>
            );
          })}
        </motion.ul>
      </div>

      {/* Transition line: chaos pauses, then resolves into structure */}
      <Reveal delay={0.1}>
        <p className="mt-16 border-t border-white/10 pt-8 font-mono text-sm text-white/40">
          <span className="text-[#f5b14c]">{"// "}</span>
          AI workflows should not run in the dark.
        </p>
      </Reveal>
    </SectionShell>
  );
}
