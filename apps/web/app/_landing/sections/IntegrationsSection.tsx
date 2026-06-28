"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Ban,
  Boxes,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  Github,
  Mail,
  MessageSquare,
  Sparkles,
  Webhook,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell } from "./shared";

const ORBIT = [
  { icon: Mail, label: "Email" },
  { icon: Database, label: "CRM" },
  { icon: MessageSquare, label: "Team chat" },
  { icon: FileText, label: "Documents" },
  { icon: Github, label: "Developer" },
  { icon: Webhook, label: "Webhooks" },
  { icon: Sparkles, label: "AI models" },
  { icon: CreditCard, label: "Billing" },
] as const;

export function IntegrationsSection() {
  const reduce = useReducedMotion();
  const radius = 132;
  return (
    <SectionShell id="integrations" glow="brand" className="bg-[#07080a] text-white">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        {/* Copy */}
        <div>
          <Reveal>
            <Eyebrow icon={<Boxes className="h-3.5 w-3.5" />}>Integrations</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Connect your tools.
              <br />
              <span className="text-white/45">Keep control in the middle.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg">
              Automate across connected services while preserving review steps,
              credential boundaries, and execution records.
            </p>
          </Reveal>

          <div className="mt-7 space-y-2.5">
            <Reveal delay={0.12}>
              <div className="flex items-center gap-2.5 rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.06] px-3.5 py-3">
                <CheckCircle2 className="h-4 w-4 text-[#34d399]" />
                <span className="text-[12.5px] text-[#7ff0c4]">Verified webhook · signature checked</span>
              </div>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="flex items-center gap-2.5 rounded-xl border border-[#f0563f]/25 bg-[#f0563f]/[0.06] px-3.5 py-3">
                <Ban className="h-4 w-4 text-[#f0563f]" />
                <span className="text-[12.5px] text-[#ffb0a3]">Unverified webhook · rejected before side effects</span>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Orbit diagram */}
        <Reveal delay={0.1}>
          <div className="relative mx-auto flex h-[360px] w-full max-w-[400px] items-center justify-center">
            {/* rings */}
            <div className="absolute h-[300px] w-[300px] rounded-full border border-white/[0.07]" />
            <div className="absolute h-[200px] w-[200px] rounded-full border border-white/[0.05]" />

            {/* rotating orbit layer */}
            <motion.div
              className="absolute h-[264px] w-[264px]"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            >
              {ORBIT.map((item, i) => {
                const Icon = item.icon;
                const angle = (i / ORBIT.length) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                return (
                  <div
                    key={item.label}
                    className="absolute left-1/2 top-1/2"
                    style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                  >
                    {/* counter-rotate so icons stay upright while the layer spins */}
                    <motion.div
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#0d0f14] text-white/70 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]"
                      animate={reduce ? undefined : { rotate: -360 }}
                      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                      title={item.label}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </motion.div>
                  </div>
                );
              })}
            </motion.div>

            {/* center core */}
            <div className="relative z-10 flex h-20 w-20 flex-col items-center justify-center rounded-2xl border border-[#f05a28]/40 bg-[#f05a28]/[0.08] shadow-[0_0_50px_-8px_rgba(240,90,40,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-8 w-8 object-contain" />
              <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#ffb799]">core</span>
            </div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
