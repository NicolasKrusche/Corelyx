"use client";

import React from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Building2,
  FileText,
  Globe2,
  Lock,
  Scale,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SceneLabel } from "./scene-kit";

const TRUST = [
  { icon: Lock, label: "Privacy policy", href: "/privacy", hint: "What we collect, why, and for how long." },
  { icon: FileText, label: "DPA", href: "/dpa", hint: "Data processing agreement for customers." },
  { icon: ServerCog, label: "Subprocessors", href: "/subprocessors", hint: "The vendors in our processing chain." },
  { icon: ShieldCheck, label: "Security architecture", href: "/security", hint: "How credentials, runtime, and data are isolated." },
  { icon: Scale, label: "GDPR workflows", href: "/gdpr", hint: "How Corelyx supports GDPR obligations." },
  { icon: ScrollText, label: "AI Act workflows", href: "/ai-act", hint: "Risk classification and oversight controls." },
  { icon: Globe2, label: "Data residency", href: "/data-residency", hint: "Where your data is stored and processed." },
  { icon: Building2, label: "Terms", href: "/terms", hint: "The terms that govern using Corelyx." },
  { icon: Users, label: "Vulnerability contact", href: "/security", hint: "Report a security issue responsibly." },
] as const;

const parent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function TrustLayerScene() {
  return (
    <section
      id="trust"
      className="scene relative w-full overflow-hidden px-5 py-28 text-white sm:px-8"
      style={{ perspective: "1400px" }}
    >
      {/* calmer graphite wash to mark the transition */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b1018]/0 via-[#10151f]/60 to-[#0b1018]/0" />

      <div className="relative mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
            className="max-w-2xl"
          >
            <SceneLabel tone="cyan" className="mb-5">Trust &amp; compliance</SceneLabel>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              Built for review, not just demos.
            </h2>
            <p className="mt-5 text-pretty text-base leading-7 text-white/55">
              Corelyx makes security, privacy, data processing, subprocessors,
              residency context, and workflow governance easy to inspect.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Link
              href="/trust"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/[0.06] px-4 py-2 text-sm font-semibold text-[#a5e3ff] transition-colors hover:bg-[#38bdf8]/[0.12]"
            >
              Visit Trust Center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>

        <motion.div
          variants={parent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <motion.div key={t.label} variants={item} style={{ transformStyle: "preserve-3d" }}>
                <Link
                  href={t.href}
                  className="group flex h-full items-start gap-3 rounded-2xl border border-white/10 bg-[#0a0d13]/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#38bdf8]/35 hover:shadow-[0_24px_60px_-30px_rgba(56,189,248,0.4)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0d1119] text-[#38bdf8]">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                      {t.label}
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-white/30 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-white/40">{t.hint}</span>
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
