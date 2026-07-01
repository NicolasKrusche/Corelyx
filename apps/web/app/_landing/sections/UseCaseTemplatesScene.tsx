"use client";

import React from "react";
import { gsap } from "gsap";
import {
  FileSearch,
  Headset,
  Inbox,
  ScrollText,
  Send,
  ShieldCheck,
  Users,
  FileBadge,
} from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { reportSceneProgress } from "../three/scroll-state";

/* Scene 10 — use-case templates. The cards arrive from depth like panels in
   the same 3D space as the rest of the film; the featured template then
   unfolds its governed mini-workflow (trigger → AI → policy → approval →
   action → evidence) step by step. Hover unfolds any card. */

const STEP_TONES = ["#94a3b8", "#38bdf8", "#5b8cff", "#f5b14c", "#f05a28", "#34d399"];
const STEP_LABELS = ["Trigger", "AI", "Policy", "Approval", "Action", "Evidence"];

const USE_CASES = [
  { icon: ScrollText, accent: "#38bdf8", title: "GDPR request handling", body: "Structured DSAR steps with retention awareness and human review." },
  { icon: Inbox, accent: "#5b8cff", title: "Email classification", body: "Categorize, summarize, and route — approval before sensitive actions." },
  { icon: Users, accent: "#f5b14c", title: "CRM enrichment", body: "Prepare record updates, but pause before changing customer data." },
  { icon: Headset, accent: "#34d399", title: "Support triage", body: "Classify, draft replies, and keep an approval trail for every send." },
  { icon: FileSearch, accent: "#a78bfa", title: "Document processing", body: "Extract structured data while preserving review and evidence." },
  { icon: ShieldCheck, accent: "#f05a28", title: "AI governance workflow", body: "Attach risk metadata, oversight checkpoints, and documentation." },
  { icon: FileBadge, accent: "#22d3ee", title: "Compliance evidence export", body: "Turn a completed run into an exportable, redacted evidence package." },
  { icon: Send, accent: "#fb7185", title: "Human-reviewed outbound", body: "Hold customer-facing messages for approval before they leave." },
] as const;

export function UseCaseTemplatesScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".uc-head"), { opacity: 0, y: 24 });
    gsap.set(q(".uc-card"), { z: -420, y: 70, rotateX: 10, opacity: 0, filter: "blur(6px)" });
    gsap.set(q(".uc-featured .uc-line"), { scaleX: 0 });
    gsap.set(q(".uc-featured .uc-dot"), { opacity: 0.35, scale: 0.7 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1500",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("usecases"),
      },
    });

    tl.to(q(".uc-head"), { opacity: 1, y: 0, ease: "power3.out", duration: 0.8 }, 0)
      // panels arrive from depth
      .to(q(".uc-card"), {
        z: 0,
        y: 0,
        rotateX: 0,
        opacity: 1,
        filter: "blur(0px)",
        ease: "power3.out",
        duration: 1.1,
        stagger: { each: 0.09, from: "start" },
      }, 0.15)
      // the featured template steps forward and unfolds its governed flow
      .to(q(".uc-featured"), {
        z: 60,
        borderColor: "rgba(56,189,248,0.45)",
        boxShadow: "0 34px 80px -30px rgba(56,189,248,0.45)",
        ease: "power2.out",
        duration: 0.7,
      }, 1.5)
      .to(q(".uc-featured .uc-line"), { scaleX: 1, ease: "power1.inOut", duration: 0.35, stagger: 0.1 }, 1.7)
      .to(q(".uc-featured .uc-dot"), { opacity: 1, scale: 1, ease: "back.out(2)", duration: 0.35, stagger: 0.1 }, 1.75);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="use-cases" className="text-white">
      <div className="mx-auto w-full max-w-6xl py-8">
        <div className="uc-head mb-6 max-w-2xl">
          <SceneLabel tone="cyan" className="mb-5">Templates</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Templates for workflows where control matters.
          </h2>
          <p className="mt-3 text-pretty text-base leading-7 text-white/55">
            Each template follows the same governed shape — trigger, AI step,
            policy check, approval, action, evidence.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ perspective: "1400px" }}>
          {USE_CASES.map((uc, idx) => {
            const Icon = uc.icon;
            const featured = idx === 0;
            return (
              <div
                key={uc.title}
                className={`uc-card group relative flex flex-col rounded-2xl border border-white/10 bg-[#0a0d13]/85 p-4 transition-colors duration-300 hover:border-[#38bdf8]/40 ${
                  featured ? "uc-featured" : ""
                } ${idx % 2 === 1 ? "lg:mt-6" : ""}`}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0d1119]"
                    style={{ color: uc.accent }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <h3 className="text-[14px] font-semibold leading-tight">{uc.title}</h3>
                </div>
                <p className="mt-3 flex-1 text-[12.5px] leading-6 text-white/45">{uc.body}</p>

                {/* governed mini workflow */}
                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center justify-between gap-1">
                    {STEP_LABELS.map((label, i) => (
                      <React.Fragment key={label}>
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className="uc-dot h-2 w-2 rounded-full opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:shadow-[0_0_8px_currentColor]"
                            style={{
                              background: STEP_TONES[i],
                              color: STEP_TONES[i],
                              transitionDelay: `${i * 60}ms`,
                            }}
                          />
                          <span
                            className="uc-step font-mono text-[7.5px] uppercase tracking-wide text-white/30 transition-colors duration-300 group-hover:text-white/55"
                            style={{ transitionDelay: `${i * 60}ms` }}
                          >
                            {label}
                          </span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                          <span
                            className="uc-line mb-3 h-px flex-1 origin-left bg-white/15 transition-transform duration-300 group-hover:scale-x-100"
                            style={{ transitionDelay: `${i * 60}ms` }}
                            aria-hidden="true"
                          />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PinnedScene>
  );
}
