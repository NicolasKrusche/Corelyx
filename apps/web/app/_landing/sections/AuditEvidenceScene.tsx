"use client";

import React from "react";
import { gsap } from "gsap";
import { CheckCircle2, Download, FileText, Lock } from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";

const TIMELINE = [
  { t: "09:41:02", label: "Trigger received", detail: "Gmail · #4821" },
  { t: "09:41:03", label: "AI classification", detail: "claude · v2 schema" },
  { t: "09:41:03", label: "Policy checkpoint", detail: "personal data" },
  { t: "09:48:17", label: "Approval decision", detail: "approved · ops@" },
  { t: "09:48:18", label: "CRM write", detail: "boundary enforced" },
  { t: "09:48:19", label: "Evidence sealed", detail: "retention 24mo" },
];

const FIELDS: [string, string, boolean][] = [
  ["Run ID", "run_8f21c4", false],
  ["Workflow version", "v7", false],
  ["Approval", "approved", false],
  ["Reviewer", "████████", true],
  ["Model / provider", "claude · eu", false],
  ["Customer", "████████", true],
  ["Policy checkpoint", "passed", false],
  ["Credential boundary", "enforced", false],
];

export function AuditEvidenceScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".ae-copy"), { opacity: 0, y: 24 });
    gsap.set(q(".ae-tl-item"), { opacity: 0, x: -16 });
    gsap.set(q(".ae-card"), { opacity: 0, y: 60, rotateX: 18 });
    gsap.set(q(".ae-field"), { opacity: 0, y: 10 });
    gsap.set(q(".ae-redact"), { backgroundColor: "rgba(255,255,255,0.04)" });
    gsap.set(q(".ae-export"), { opacity: 0, scale: 0.85 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1600",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    tl.to(q(".ae-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 1 }, 0)
      .to(q(".ae-tl-item"), { opacity: 1, x: 0, ease: "power2.out", duration: 0.5, stagger: 0.12 }, 0.2)
      .to(q(".ae-card"), { opacity: 1, y: 0, rotateX: 0, ease: "power3.out", duration: 1, stagger: 0.12 }, 0.6)
      .to(q(".ae-field"), { opacity: 1, y: 0, ease: "power2.out", duration: 0.4, stagger: 0.05 }, 1.1)
      .to(q(".ae-redact"), { backgroundColor: "rgba(56,189,248,0.12)", duration: 0.5, stagger: 0.1 }, 1.6)
      .to(q(".ae-export"), { opacity: 1, scale: 1, ease: "back.out(1.6)", duration: 0.6 }, 1.9);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="audit" className="text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="ae-copy mb-10 max-w-2xl">
          <SceneLabel tone="cyan" className="mb-5">Audit evidence</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Every important run should leave evidence.
          </h2>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55">
            Corelyx turns workflow execution into reviewable records: schema
            versions, approval decisions, timestamps, policy checks, redacted logs,
            and exportable evidence packages.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          {/* timeline */}
          <div className="rounded-2xl border border-white/10 bg-[#070a10]/90 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Run log</span>
              <span className="rounded-full border border-[#34d399]/30 bg-[#34d399]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#7ff0c4]">Completed</span>
            </div>
            <ol className="relative ml-1.5 space-y-3.5 border-l border-white/10 pl-5">
              {TIMELINE.map((e) => (
                <li key={e.label} className="ae-tl-item relative">
                  <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-[#34d399] ring-4 ring-[#070a10]" />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-medium text-white/80">{e.label}</p>
                    <span className="font-mono text-[10px] text-white/30">{e.t}</span>
                  </div>
                  <p className="font-mono text-[10px] text-white/40">{e.detail}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* dossier stack */}
          <div style={{ perspective: "1300px" }}>
            <div className="relative [transform-style:preserve-3d]">
              {/* back cards peeking */}
              <div className="ae-card absolute inset-x-3 -top-3 h-full rounded-2xl border border-white/[0.06] bg-[#0a0e15]/60" style={{ transform: "translateZ(-40px)" }} />
              <div className="ae-card absolute inset-x-1.5 -top-1.5 h-full rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80" style={{ transform: "translateZ(-20px)" }} />
              {/* front card */}
              <div className="ae-card relative rounded-2xl border border-white/12 bg-[#070a10]/95 p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#38bdf8]" />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Evidence package</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {FIELDS.map(([k, v, redacted]) => (
                    <div key={k} className="ae-field flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-white/30">{k}</dt>
                      <dd className={redacted ? "ae-redact rounded px-1.5 font-mono text-[11px] tracking-widest text-[#a5e3ff]" : "truncate font-mono text-[11px] text-white/65"}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="ae-export mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.06] p-3.5">
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#7ff0c4]">
                    <CheckCircle2 className="h-4 w-4" />
                    Audit-ready · payloads redacted
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/80">
                    <Download className="h-3.5 w-3.5" /> Export
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                  <Lock className="h-3 w-3" /> Sensitive values redacted in the exported package.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PinnedScene>
  );
}
