"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FileSearch,
  Headset,
  Inbox,
  LayoutGrid,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, staggerItem, staggerParent } from "./shared";

type Step = { label: string; tone: "trigger" | "ai" | "review" | "action" | "evidence" };

const STEP_DOT: Record<Step["tone"], string> = {
  trigger: "bg-white/40",
  ai: "bg-[#38bdf8]",
  review: "bg-[#f5b14c]",
  action: "bg-[#f05a28]",
  evidence: "bg-[#34d399]",
};

const USE_CASES: {
  icon: React.ElementType;
  title: string;
  body: string;
  steps: Step[];
}[] = [
  {
    icon: ShieldCheck,
    title: "Compliance workflows",
    body: "AI-assisted processes with review checkpoints, evidence, and documentation context.",
    steps: [
      { label: "Event", tone: "trigger" },
      { label: "Classify", tone: "ai" },
      { label: "Review", tone: "review" },
      { label: "Document", tone: "action" },
      { label: "Evidence", tone: "evidence" },
    ],
  },
  {
    icon: ScrollText,
    title: "GDPR request handling",
    body: "DSAR-style workflows with structured steps, retention awareness, and human review.",
    steps: [
      { label: "Request", tone: "trigger" },
      { label: "Locate data", tone: "ai" },
      { label: "Review", tone: "review" },
      { label: "Respond", tone: "action" },
      { label: "Log", tone: "evidence" },
    ],
  },
  {
    icon: Inbox,
    title: "Email classification",
    body: "Categorize, summarize, and route incoming messages with approval before sensitive actions.",
    steps: [
      { label: "Inbox", tone: "trigger" },
      { label: "Summarize", tone: "ai" },
      { label: "Approve", tone: "review" },
      { label: "Route", tone: "action" },
      { label: "Record", tone: "evidence" },
    ],
  },
  {
    icon: Users,
    title: "CRM enrichment",
    body: "Prepare structured CRM updates, but pause for review before changing customer records.",
    steps: [
      { label: "Signal", tone: "trigger" },
      { label: "Enrich", tone: "ai" },
      { label: "Review", tone: "review" },
      { label: "Update", tone: "action" },
      { label: "Trail", tone: "evidence" },
    ],
  },
  {
    icon: Headset,
    title: "Support triage",
    body: "Classify requests, suggest replies, and keep an approval trail for customer-facing actions.",
    steps: [
      { label: "Ticket", tone: "trigger" },
      { label: "Draft", tone: "ai" },
      { label: "Approve", tone: "review" },
      { label: "Reply", tone: "action" },
      { label: "Evidence", tone: "evidence" },
    ],
  },
  {
    icon: FileSearch,
    title: "Document processing",
    body: "Extract structured information from documents while preserving review and evidence.",
    steps: [
      { label: "Upload", tone: "trigger" },
      { label: "Extract", tone: "ai" },
      { label: "Verify", tone: "review" },
      { label: "Store", tone: "action" },
      { label: "Evidence", tone: "evidence" },
    ],
  },
];

export function UseCasesSection() {
  return (
    <SectionShell id="use-cases" glow="brand" className="bg-[#0a0c10] text-white">
      <div className="max-w-2xl">
        <Reveal>
          <Eyebrow icon={<LayoutGrid className="h-3.5 w-3.5" />}>Use cases</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            Built for processes that need a paper trail.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
            Every template follows the same shape: a trigger, an AI step, a review
            step, an action, and an evidence output.
          </p>
        </Reveal>
      </div>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {USE_CASES.map((uc) => {
          const Icon = uc.icon;
          return (
            <motion.div
              key={uc.title}
              variants={staggerItem}
              className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[#f05a28]/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0d0f14] text-[#f05a28]">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <h3 className="text-[15px] font-semibold leading-tight">{uc.title}</h3>
              </div>
              <p className="mt-3 flex-1 text-[13px] leading-6 text-white/45">{uc.body}</p>

              {/* mini workflow */}
              <div className="mt-5 flex items-center justify-between gap-1 border-t border-white/[0.07] pt-4">
                {uc.steps.map((s, i) => (
                  <React.Fragment key={s.label}>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STEP_DOT[s.tone]}`} />
                      <span className="font-mono text-[8.5px] uppercase tracking-wide text-white/35">{s.label}</span>
                    </div>
                    {i < uc.steps.length - 1 && (
                      <span className="mb-3 h-px flex-1 bg-white/10" aria-hidden="true" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </SectionShell>
  );
}
