"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

const TRUST = [
  { icon: ShieldCheck, label: "Security architecture", href: "/security", hint: "How credentials, runtime, and data are isolated." },
  { icon: Lock, label: "Privacy policy", href: "/privacy", hint: "What we collect, why, and for how long." },
  { icon: FileText, label: "DPA", href: "/dpa", hint: "Data processing agreement for customers." },
  { icon: ServerCog, label: "Subprocessors", href: "/subprocessors", hint: "The vendors in our processing chain." },
  { icon: Globe2, label: "Data residency", href: "/data-residency", hint: "Where your data is stored and processed." },
  { icon: Scale, label: "GDPR workflows", href: "/gdpr", hint: "How Corelyx supports GDPR obligations." },
  { icon: ScrollText, label: "EU AI Act workflows", href: "/ai-act", hint: "Risk classification and oversight controls." },
  { icon: Building2, label: "Terms", href: "/terms", hint: "The terms that govern using Corelyx." },
  { icon: Users, label: "Vulnerability contact", href: "/security", hint: "Report a security issue responsibly." },
] as const;

export function TrustCenterSection() {
  return (
    <SectionShell id="trust" glow="cyan" className="bg-[#07080a] text-white">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow tone="cyan" icon={<ShieldCheck className="h-3.5 w-3.5" />}>Trust center</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Built for review, not just demos.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
              Compliance-sensitive buyers need more than a landing page. Corelyx
              makes security, privacy, data processing, subprocessors, residency
              context, and workflow governance easy to inspect.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <Link
            href="/trust"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/[0.06] px-4 py-2 text-sm font-semibold text-[#a5e3ff] transition-colors hover:bg-[#38bdf8]/[0.12]"
          >
            Visit Trust Center
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TRUST.map((t) => {
          const Icon = t.icon;
          return (
            <motion.div key={t.label} variants={staggerItem}>
              <Link
                href={t.href}
                className="group flex h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-[#38bdf8]/35 hover:bg-white/[0.035]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0d0f14] text-[#38bdf8]">
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
    </SectionShell>
  );
}
