"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  Github,
  Headset,
  Mail,
  MessageSquare,
  Sparkles,
  Webhook,
} from "lucide-react";
import { SceneLabel, usePrefersReducedMotion } from "./scene-kit";

const ORBIT = [
  { icon: Mail, label: "Email" },
  { icon: Database, label: "CRM" },
  { icon: MessageSquare, label: "Slack / Teams" },
  { icon: FileText, label: "Documents" },
  { icon: Github, label: "Developer" },
  { icon: Webhook, label: "Webhooks" },
  { icon: Sparkles, label: "AI models" },
  { icon: Headset, label: "Support" },
  { icon: CreditCard, label: "Billing" },
] as const;

export function IntegrationsOrbitScene() {
  const reduced = usePrefersReducedMotion();
  const radius = 150;

  return (
    <section
      id="integrations"
      className="scene relative flex min-h-screen w-full items-center justify-center overflow-hidden px-5 py-24 text-white sm:px-8"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        {/* copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
          >
            <SceneLabel tone="cyan" className="mb-5">Integrations</SceneLabel>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              Connect your tools.
              <br />
              <span className="text-white/45">Keep control in the middle.</span>
            </h2>
            <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
              Corelyx connects workflows across services while preserving approval
              gates, credential boundaries, and execution records.
            </p>
          </motion.div>

          <div className="mt-7 space-y-2.5">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex items-center gap-2.5 rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.06] px-3.5 py-3"
            >
              <CheckCircle2 className="h-4 w-4 text-[#34d399]" />
              <span className="text-[12.5px] text-[#7ff0c4]">Verified webhook · signature checked</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="flex items-center gap-2.5 rounded-xl border border-[#f0563f]/25 bg-[#f0563f]/[0.06] px-3.5 py-3"
            >
              <Ban className="h-4 w-4 text-[#f0563f]" />
              <span className="text-[12.5px] text-[#ffb0a3]">Unverified webhook · rejected before side effects</span>
            </motion.div>
          </div>
        </div>

        {/* orbit */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto flex h-[400px] w-full max-w-[440px] items-center justify-center"
        >
          <div className="absolute h-[336px] w-[336px] rounded-full border border-white/[0.07]" />
          <div className="absolute h-[224px] w-[224px] rounded-full border border-white/[0.05]" />
          <div className="absolute h-[336px] w-[336px] rounded-full bg-[#1d4e9c]/10 blur-2xl" />

          <motion.div
            className="absolute h-[300px] w-[300px]"
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
          >
            {ORBIT.map((item, i) => {
              const Icon = item.icon;
              const angle = (i / ORBIT.length) * Math.PI * 2;
              // Round to whole pixels so SSR and client markup match exactly.
              const x = Math.round(Math.cos(angle) * radius);
              const y = Math.round(Math.sin(angle) * radius);
              return (
                <div
                  key={item.label}
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                >
                  <motion.div
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#0b0e15] text-white/70 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]"
                    animate={reduced ? undefined : { rotate: -360 }}
                    transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
                    title={item.label}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </motion.div>
                </div>
              );
            })}
          </motion.div>

          {/* governance boundary ring */}
          <div className="absolute h-[120px] w-[120px] rounded-full border border-dashed border-[#38bdf8]/30" />

          {/* core */}
          <div className="relative z-10 flex h-20 w-20 flex-col items-center justify-center rounded-2xl border border-[#f05a28]/40 bg-[#f05a28]/[0.08] shadow-[0_0_50px_-8px_rgba(240,90,40,0.6)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-8 w-8 object-contain" />
            <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#ffb799]">core</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
