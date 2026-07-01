"use client";

import React from "react";
import { gsap } from "gsap";
import { ShieldCheck } from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { SystemGraph } from "./SystemGraph";
import { reportSceneProgress } from "../three/scroll-state";

const CHECKPOINTS = [
  "Data minimisation",
  "Retention logic",
  "Human oversight",
  "Risk metadata",
  "Approval required",
  "Documentation export",
  "Redacted logs",
  "Policy check",
];

export function GovernanceLayerScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".sg-shield"), { opacity: 0 });
    gsap.set(q(".sg-marker"), { opacity: 0, scale: 0.6, yPercent: 10 });
    gsap.set(q(".gov-chip"), { opacity: 0, x: -16 });
    gsap.set(q(".gov-copy"), { opacity: 0, y: 24 });
    gsap.set(q(".gov-scan"), { opacity: 0, yPercent: -140 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1500",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("governance"),
      },
    });

    tl.to(q(".gov-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 1 }, 0)
      .to(q(".sg-shield"), { opacity: 1, ease: "power2.out", duration: 1.2 }, 0.2)
      .fromTo(q(".gov-stage"), { rotateY: -12, rotateX: 6 }, { rotateY: 10, rotateX: -2, ease: "sine.inOut", duration: 2.6 }, 0)
      // compliance scan sweeps the graph as the shield engages
      .to(q(".gov-scan"), { opacity: 1, duration: 0.3 }, 0.5)
      .to(q(".gov-scan"), { yPercent: 240, ease: "power1.inOut", duration: 1.6 }, 0.6)
      .to(q(".gov-scan"), { opacity: 0, duration: 0.3 }, 2.1)
      .to(q(".sg-marker"), { opacity: 1, scale: 1, yPercent: 0, ease: "back.out(1.6)", duration: 0.8, stagger: 0.18 }, 0.6)
      .to(q(".gov-chip"), { opacity: 1, x: 0, ease: "power2.out", duration: 0.5, stagger: 0.06 }, 0.8);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="compliance" className="text-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        {/* copy + checkpoint chips */}
        <div className="gov-copy">
          <SceneLabel tone="cyan" className="mb-5">Governance layer</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Compliance should live inside the workflow.
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
            Add governance context before execution: data minimisation, retention
            settings, human oversight, risk metadata, transparency notes, and
            documentation-ready records.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {CHECKPOINTS.map((c) => (
              <span
                key={c}
                className="gov-chip inline-flex items-center gap-1.5 rounded-full border border-[#38bdf8]/25 bg-[#38bdf8]/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#a5e3ff]"
              >
                <ShieldCheck className="h-3 w-3" />
                {c}
              </span>
            ))}
          </div>
          <p className="mt-6 font-mono text-[12px] leading-5 text-white/35">
            Workflow controls and reviewable evidence — not legal advice or a
            guarantee of compliance.
          </p>
        </div>

        {/* governed graph with shield + markers */}
        <div style={{ perspective: "1300px" }}>
          <div className="gov-stage relative [transform-style:preserve-3d]">
            <SystemGraph variant="governed" showShield showMarkers className="scale-[0.8] sm:scale-90 lg:scale-100" />
            {/* compliance scan beam */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
              <div
                className="gov-scan absolute inset-x-0 top-1/4 h-24"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, rgba(56,189,248,0.14) 45%, rgba(56,189,248,0.28) 50%, rgba(56,189,248,0.14) 55%, transparent)",
                  boxShadow: "0 0 40px rgba(56,189,248,0.2)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </PinnedScene>
  );
}
