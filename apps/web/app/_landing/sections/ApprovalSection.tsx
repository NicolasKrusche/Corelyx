"use client";

import React from "react";
import {
  Check,
  Pencil,
  ShieldQuestion,
  UserCheck,
  X,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, StatusPill } from "./shared";

const META = [
  ["Workflow", "support-triage.flow"],
  ["Trigger", "Gmail · inbound message"],
  ["Reviewer", "ops@corelyx.app"],
  ["Evidence ID", "run_8f21c4"],
] as const;

export function ApprovalSection() {
  return (
    <SectionShell id="approvals" glow="amber" className="bg-[#07080a] text-white">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        {/* Copy */}
        <div>
          <Reveal>
            <Eyebrow tone="amber" icon={<UserCheck className="h-3.5 w-3.5" />}>
              Human-in-the-loop execution
            </Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Pause before sensitive actions.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg">
              Some AI recommendations should not execute automatically. Corelyx
              uses human approval gates so sensitive messages, record changes, or
              external updates can be reviewed before they happen.
            </p>
          </Reveal>

          {/* mini state flow */}
          <Reveal delay={0.15}>
            <div className="mt-8 flex items-center gap-2 font-mono text-[11px]">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-white/55">run</span>
              <span className="text-white/25">→</span>
              <span className="rounded-md border border-[#f5b14c]/30 bg-[#f5b14c]/10 px-2 py-1 text-[#ffd79a]">review required</span>
              <span className="text-white/25">→</span>
              <span className="rounded-md border border-[#34d399]/30 bg-[#34d399]/10 px-2 py-1 text-[#7ff0c4]">approved</span>
              <span className="text-white/25">→</span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-white/55">continue</span>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-8 font-mono text-sm text-white/40">
              <span className="text-[#f5b14c]">{"// "}</span>
              Human approval is not friction. It is accountability.
            </p>
          </Reveal>
        </div>

        {/* Approval request card */}
        <Reveal delay={0.1}>
          <div className="overflow-hidden rounded-2xl border border-[#f5b14c]/25 bg-[#0a0c10] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#f5b14c]/[0.05] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4 text-[#f5b14c]" />
                <span className="text-sm font-semibold">Approval required</span>
              </div>
              <StatusPill state="review">Pending</StatusPill>
            </div>

            <div className="p-5">
              {/* risk labels */}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#f0563f]/30 bg-[#f0563f]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffb0a3]">
                  Personal data
                </span>
                <span className="rounded-full border border-[#f5b14c]/30 bg-[#f5b14c]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffd79a]">
                  Customer-facing
                </span>
              </div>

              {/* AI recommendation */}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/35">
                  AI-generated recommendation
                </p>
                <p className="mt-2 text-[13.5px] leading-6 text-white/75">
                  Reply to <span className="text-white">Anna M.</span> confirming her
                  refund and update her CRM record to{" "}
                  <span className="text-[#ffd79a]">&ldquo;refund approved&rdquo;</span>.
                </p>
              </div>

              {/* proposed action / data */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">Proposed action</p>
                  <p className="mt-1 text-white/70">Send email + CRM write</p>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">Data involved</p>
                  <p className="mt-1 text-white/70">Name, order #, email</p>
                </div>
              </div>

              {/* decision buttons */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button className="flex items-center justify-center gap-1.5 rounded-lg bg-[#34d399] px-3 py-2.5 text-[12px] font-semibold text-[#04231a] transition-opacity hover:opacity-90">
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.06]">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button className="flex items-center justify-center gap-1.5 rounded-lg border border-[#f0563f]/30 bg-[#f0563f]/[0.06] px-3 py-2.5 text-[12px] font-medium text-[#ffb0a3] transition-colors hover:bg-[#f0563f]/10">
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </div>

              {/* metadata */}
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-4">
                {META.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-white/30">{k}</dt>
                    <dd className="truncate font-mono text-[11px] text-white/55">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
