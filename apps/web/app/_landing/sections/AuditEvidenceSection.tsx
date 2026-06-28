"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, StatusPill, staggerItem, staggerParent } from "./shared";

const TIMELINE = [
  { t: "09:41:02", label: "Trigger received", detail: "Gmail · message #4821", state: "done" },
  { t: "09:41:03", label: "AI classification", detail: "model: claude · v2 schema", state: "done" },
  { t: "09:41:03", label: "Policy checkpoint", detail: "personal data detected", state: "done" },
  { t: "09:48:17", label: "Approval decision", detail: "approved · ops@corelyx.app", state: "review" },
  { t: "09:48:18", label: "CRM write", detail: "credential boundary enforced", state: "done" },
  { t: "09:48:19", label: "Evidence sealed", detail: "retention: 24 months", state: "done" },
] as const;

const FIELDS = [
  ["Run ID", "run_8f21c4"],
  ["Workflow version", "v7"],
  ["Trigger source", "gmail.message"],
  ["Approval decision", "approved"],
  ["Reviewer", "ops@corelyx.app"],
  ["Model / provider", "claude · eu-region"],
  ["Policy checkpoint", "passed"],
  ["Credential boundary", "enforced"],
  ["Retention context", "24 months"],
] as const;

export function AuditEvidenceSection() {
  return (
    <SectionShell id="audit" glow="cyan" className="bg-[#0a0c10] text-white">
      <div className="max-w-2xl">
        <Reveal>
          <Eyebrow tone="cyan" icon={<FileCheck2 className="h-3.5 w-3.5" />}>Audit evidence</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            Every important run should leave evidence.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
            Corelyx turns workflow execution into reviewable records: schema
            versions, approval decisions, model metadata, retention context, policy
            checks, timestamps, and redacted logs.
          </p>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Run timeline */}
        <Reveal>
          <div className="rounded-2xl border border-white/10 bg-[#070809] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Run log</span>
              <StatusPill state="approved">Completed</StatusPill>
            </div>
            <ol className="relative ml-1.5 space-y-4 border-l border-white/10 pl-5">
              {TIMELINE.map((e) => (
                <li key={e.label} className="relative">
                  <span
                    className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[#070809] ${
                      e.state === "review"
                        ? "bg-[#f5b14c]"
                        : "bg-[#34d399]"
                    }`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-medium text-white/80">{e.label}</p>
                    <span className="font-mono text-[10px] text-white/30">{e.t}</span>
                  </div>
                  <p className="font-mono text-[10.5px] text-white/40">{e.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* Evidence package */}
        <Reveal delay={0.08}>
          <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#070809] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#38bdf8]" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Evidence package</span>
            </div>
            <motion.dl
              variants={staggerParent}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="grid flex-1 grid-cols-1 gap-y-2.5 sm:grid-cols-2 sm:gap-x-4"
            >
              {FIELDS.map(([k, v]) => (
                <motion.div key={k} variants={staggerItem} className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-white/30">{k}</dt>
                  <dd className="truncate font-mono text-[11px] text-white/65">{v}</dd>
                </motion.div>
              ))}
            </motion.dl>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.06] p-3.5">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#7ff0c4]">
                <CheckCircle2 className="h-4 w-4" />
                Audit-ready · payloads redacted
              </span>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/[0.1]">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
