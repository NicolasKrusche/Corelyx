"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Ban,
  Cpu,
  EyeOff,
  KeyRound,
  Lock,
  Monitor,
  ScanLine,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell } from "./shared";

const PRINCIPLES = [
  { icon: ServerCog, text: "Server-side OAuth token resolution" },
  { icon: KeyRound, text: "Vault-backed secret references" },
  { icon: ShieldCheck, text: "Scoped internal calls" },
  { icon: EyeOff, text: "No raw tokens in frontend responses" },
  { icon: ScanLine, text: "Redacted logs" },
  { icon: Lock, text: "Least-privilege execution" },
] as const;

export function CredentialBoundarySection() {
  const reduce = useReducedMotion();
  return (
    <SectionShell id="security" glow="brand" className="bg-[#0a0c10] text-white">
      <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        {/* Diagram */}
        <Reveal>
          <div className="relative rounded-2xl border border-white/10 bg-[#070809] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="grid grid-cols-3 items-center gap-2">
              {/* Browser / canvas */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                <Monitor className="mx-auto h-5 w-5 text-white/50" strokeWidth={1.5} />
                <p className="mt-2 text-[11px] font-medium text-white/60">Browser</p>
                <p className="font-mono text-[9px] text-white/30">workflow canvas</p>
              </div>

              {/* Vault core */}
              <div className="relative rounded-xl border border-[#f05a28]/40 bg-[#f05a28]/[0.06] p-3 text-center shadow-[0_0_40px_-8px_rgba(240,90,40,0.5)]">
                <Lock className="mx-auto h-5 w-5 text-[#f05a28]" strokeWidth={1.75} />
                <p className="mt-2 text-[11px] font-semibold text-[#ffb799]">Vault</p>
                <p className="font-mono text-[9px] text-white/40">server-side</p>
              </div>

              {/* Runtime */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                <Cpu className="mx-auto h-5 w-5 text-[#38bdf8]" strokeWidth={1.5} />
                <p className="mt-2 text-[11px] font-medium text-white/60">Runtime</p>
                <p className="font-mono text-[9px] text-white/30">scoped access</p>
              </div>
            </div>

            {/* boundary line */}
            <div className="relative my-5">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f05a28]/40 to-transparent" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f05a28]/30 bg-[#0a0c10] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#ffb799]">
                Security boundary
              </span>
            </div>

            {/* token blocked toward browser */}
            <div className="flex items-center justify-between gap-3">
              <motion.div
                className="flex items-center gap-2 rounded-lg border border-[#f0563f]/30 bg-[#f0563f]/[0.07] px-3 py-2"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <Ban className="h-4 w-4 text-[#f0563f]" />
                <span className="text-[11px] font-medium text-[#ffb0a3]">
                  Raw token &rarr; browser
                  <span className="ml-1.5 font-mono uppercase text-[#f0563f]">blocked</span>
                </span>
              </motion.div>
              <motion.div
                className="flex items-center gap-2 rounded-lg border border-[#34d399]/30 bg-[#34d399]/[0.07] px-3 py-2"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.45 }}
              >
                <ShieldCheck className="h-4 w-4 text-[#34d399]" />
                <span className="text-[11px] font-medium text-[#7ff0c4]">
                  Scoped call &rarr; runtime
                  <span className="ml-1.5 font-mono uppercase text-[#34d399]">allowed</span>
                </span>
              </motion.div>
            </div>

            {/* external services */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-5">
              {["Gmail", "Slack", "CRM", "Webhooks", "AI models"].map((svc) => (
                <span
                  key={svc}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-white/45"
                >
                  {svc}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Copy + principles */}
        <div>
          <Reveal>
            <Eyebrow icon={<Lock className="h-3.5 w-3.5" />}>Credential boundary</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Credentials stay behind the boundary.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg">
              Connector credentials are resolved through trusted server-side
              helpers — not exposed to the browser or scattered through workflow
              outputs. Corelyx treats credential access as a security boundary.
            </p>
          </Reveal>

          <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal as="li" key={p.text} delay={0.05 * i}>
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                    <Icon className="h-4 w-4 shrink-0 text-[#f05a28]" strokeWidth={1.75} />
                    <span className="text-[12.5px] leading-snug text-white/70">{p.text}</span>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}
