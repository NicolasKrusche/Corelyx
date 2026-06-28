"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import {
  FileSearch,
  Headset,
  Inbox,
  LayoutGrid,
  ScrollText,
  Send,
  ShieldCheck,
  Users,
  FileBadge,
} from "lucide-react";
import { SceneLabel } from "./scene-kit";

const STEP_TONES = ["#94a3b8", "#38bdf8", "#5b8cff", "#f5b14c", "#f05a28", "#34d399"];
const STEP_LABELS = ["Trigger", "AI", "Policy", "Approval", "Action", "Evidence"];

const USE_CASES = [
  { icon: ScrollText, title: "GDPR request handling", body: "Structured DSAR steps with retention awareness and human review." },
  { icon: Inbox, title: "Email classification", body: "Categorize, summarize, and route — approval before sensitive actions." },
  { icon: Users, title: "CRM enrichment", body: "Prepare record updates, but pause before changing customer data." },
  { icon: Headset, title: "Support triage", body: "Classify, draft replies, and keep an approval trail for every send." },
  { icon: FileSearch, title: "Document processing", body: "Extract structured data while preserving review and evidence." },
  { icon: ShieldCheck, title: "AI governance workflow", body: "Attach risk metadata, oversight checkpoints, and documentation." },
  { icon: FileBadge, title: "Compliance evidence export", body: "Turn a completed run into an exportable, redacted evidence package." },
  { icon: Send, title: "Human-reviewed outbound", body: "Hold customer-facing messages for approval before they leave." },
] as const;

const parent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export function UseCaseTemplatesScene() {
  return (
    <section
      id="use-cases"
      className="scene relative w-full overflow-hidden px-5 py-28 text-white sm:px-8"
      style={{ perspective: "1400px" }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12 max-w-2xl"
        >
          <SceneLabel tone="cyan" className="mb-5">Templates</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Templates for workflows where control matters.
          </h2>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55">
            Each template follows the same governed shape — trigger, AI step,
            policy check, approval, action, evidence. Hover to unfold the flow.
          </p>
        </motion.div>

        <motion.div
          variants={parent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {USE_CASES.map((uc) => {
            const Icon = uc.icon;
            return (
              <motion.div
                key={uc.title}
                variants={item}
                className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#0a0d13]/80 p-5 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#38bdf8]/40 hover:shadow-[0_30px_70px_-30px_rgba(56,189,248,0.4)]"
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0d1119] text-[#38bdf8] transition-colors group-hover:text-[#f05a28]">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <h3 className="text-[14px] font-semibold leading-tight">{uc.title}</h3>
                </div>
                <p className="mt-3 flex-1 text-[12.5px] leading-6 text-white/45">{uc.body}</p>

                {/* mini workflow unfolds on hover */}
                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center justify-between gap-1">
                    {STEP_LABELS.map((label, i) => (
                      <React.Fragment key={label}>
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full opacity-50 transition-all duration-300 group-hover:opacity-100"
                            style={{ background: STEP_TONES[i], transitionDelay: `${i * 60}ms`, boxShadow: `0 0 0 transparent` }}
                          />
                          <span className="font-mono text-[7.5px] uppercase tracking-wide text-white/30 transition-colors duration-300 group-hover:text-white/55" style={{ transitionDelay: `${i * 60}ms` }}>
                            {label}
                          </span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                          <span className="mb-3 h-px flex-1 origin-left scale-x-50 bg-white/10 transition-transform duration-300 group-hover:scale-x-100" style={{ transitionDelay: `${i * 60}ms` }} aria-hidden="true" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
