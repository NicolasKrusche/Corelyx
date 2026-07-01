"use client";

import React from "react";
import { gsap } from "gsap";
import { Check, Pencil, ShieldQuestion, X } from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { SystemGraph } from "./SystemGraph";
import { reportSceneProgress } from "../three/scroll-state";

const META = [
  ["Workflow", "support-triage.flow"],
  ["Trigger", "Gmail · inbound"],
  ["Reviewer", "ops@corelyx.app"],
  ["Evidence ID", "run_8f21c4"],
] as const;

export function ApprovalGateScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".ag-stage"), { opacity: 0.25, filter: "blur(7px)", scale: 0.9 });
    gsap.set(q(".ag-card"), { opacity: 0, y: 90, rotateX: 16, scale: 0.92 });
    gsap.set(q(".ag-copy"), { opacity: 0, y: 20 });
    gsap.set(q(".ag-approved"), { opacity: 0, y: 8 });
    gsap.set(q(".ag-pending"), { opacity: 1 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1700",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("approval"),
      },
    });

    tl.to(q(".ag-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 0.8 }, 0)
      .to(q(".ag-stage"), { opacity: 0.45, ease: "power2.out", duration: 1 }, 0)
      // approval node pulses amber (the run is paused)
      .to(q("[data-node='approval']"), { boxShadow: "0 0 34px -2px rgba(245,177,76,0.85)", repeat: 3, yoyo: true, duration: 0.5 }, 0.4)
      // card comes forward
      .to(q(".ag-card"), { opacity: 1, y: 0, rotateX: 0, scale: 1, ease: "power3.out", duration: 1.4 }, 0.6)
      .to({}, { duration: 1 })
      // approve
      .to(q(".ag-pending"), { opacity: 0, y: -8, duration: 0.4 }, ">")
      .to(q(".ag-approved"), { opacity: 1, y: 0, duration: 0.5 }, "<")
      .to(q(".ag-card"), { borderColor: "rgba(52,211,153,0.5)", boxShadow: "0 40px 120px -30px rgba(52,211,153,0.4)", duration: 0.6 }, "<")
      .to(q("[data-node='approval']"), { borderColor: "rgba(52,211,153,0.7)", boxShadow: "0 0 30px -4px rgba(52,211,153,0.7)", duration: 0.6 }, "<")
      .to(q(".ag-stage"), { filter: "blur(3px)", opacity: 0.55, scale: 0.94, duration: 0.8 }, "<")
      .to(q(".ag-evidence"), { opacity: 1, y: 0, ease: "back.out(1.6)", duration: 0.6 }, ">-0.2");
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="approvals" className="text-white">
      {/* background paused graph */}
      <div className="ag-stage pointer-events-none absolute left-1/2 top-1/2 w-[90%] max-w-4xl -translate-x-1/2 -translate-y-1/2">
        <SystemGraph variant="approval" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="ag-copy">
          <SceneLabel tone="amber" className="mb-5">Human-in-the-loop</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Pause before sensitive actions.
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
            Some AI outputs should not execute automatically. Corelyx approval gates
            keep humans in control before customer-facing, data-changing, or
            credentialed actions happen.
          </p>
          <p className="mt-6 font-mono text-sm text-white/40">
            <span className="text-[#f5b14c]">{"// "}</span>
            Human approval is not friction. It is accountability.
          </p>
          <div className="ag-evidence mt-6 inline-flex translate-y-2 items-center gap-2 rounded-lg border border-[#34d399]/30 bg-[#34d399]/[0.07] px-3 py-2 opacity-0">
            <Check className="h-4 w-4 text-[#34d399]" />
            <span className="font-mono text-[11px] text-[#7ff0c4]">Evidence record created · run_8f21c4</span>
          </div>
        </div>

        {/* approval card */}
        <div style={{ perspective: "1300px" }}>
          <div className="ag-card overflow-hidden rounded-2xl border border-[#f5b14c]/30 bg-[#0a0c10]/95 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] [transform-style:preserve-3d]">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#f5b14c]/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4 text-[#f5b14c]" />
                <span className="text-sm font-semibold">Approval required</span>
              </div>
              <div className="relative h-5 w-[88px]">
                <span className="ag-pending absolute right-0 rounded-full border border-[#f5b14c]/30 bg-[#f5b14c]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffd79a]">Pending</span>
                <span className="ag-approved absolute right-0 rounded-full border border-[#34d399]/30 bg-[#34d399]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#7ff0c4]">Approved</span>
              </div>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#f0563f]/30 bg-[#f0563f]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffb0a3]">Personal data</span>
                <span className="rounded-full border border-[#f5b14c]/30 bg-[#f5b14c]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffd79a]">Customer-facing</span>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/35">AI recommendation</p>
                <p className="mt-2 text-[13.5px] leading-6 text-white/75">
                  Reply to <span className="text-white">Anna M.</span> confirming her refund and update her CRM record to{" "}
                  <span className="text-[#ffd79a]">&ldquo;refund approved&rdquo;</span>.
                </p>
              </div>

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

              <div className="mt-5 grid grid-cols-3 gap-2">
                <span className="flex items-center justify-center gap-1.5 rounded-lg bg-[#34d399] px-3 py-2.5 text-[12px] font-semibold text-[#04231a]">
                  <Check className="h-3.5 w-3.5" /> Approve
                </span>
                <span className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2.5 text-[12px] font-medium text-white/70">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </span>
                <span className="flex items-center justify-center gap-1.5 rounded-lg border border-[#f0563f]/30 bg-[#f0563f]/[0.06] px-3 py-2.5 text-[12px] font-medium text-[#ffb0a3]">
                  <X className="h-3.5 w-3.5" /> Reject
                </span>
              </div>

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
        </div>
      </div>
    </PinnedScene>
  );
}
