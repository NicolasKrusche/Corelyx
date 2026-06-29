"use client";

import React from "react";
import { gsap } from "gsap";
import {
  AlertTriangle,
  EyeOff,
  FileWarning,
  KeyRound,
  Timer,
  Unplug,
  UserX,
} from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";

type RiskNode = {
  icon: React.ElementType;
  label: string;
  x: number;
  y: number;
  z: number;
  tone: "amber" | "red";
};

const RISKS: RiskNode[] = [
  { icon: EyeOff, label: "Unreviewed AI output", x: 14, y: 22, z: -180, tone: "amber" },
  { icon: UserX, label: "Missing approval", x: 70, y: 16, z: -60, tone: "amber" },
  { icon: KeyRound, label: "Exposed credentials", x: 80, y: 58, z: 40, tone: "red" },
  { icon: FileWarning, label: "No audit trail", x: 22, y: 70, z: 10, tone: "red" },
  { icon: Timer, label: "Unknown data retention", x: 50, y: 40, z: -260, tone: "amber" },
  { icon: Unplug, label: "Unverified webhook", x: 60, y: 78, z: -120, tone: "red" },
  { icon: AlertTriangle, label: "Fragmented evidence", x: 36, y: 30, z: 80, tone: "amber" },
];

export function SignalToNodesScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".risk-node"), { opacity: 0, scale: 0.4 });
    gsap.set(q(".s2-copy"), { opacity: 0, y: 40 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1400",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    tl.to(q(".s2-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 1 }, 0)
      .to(q(".risk-node"), { opacity: 1, scale: 1, ease: "back.out(1.4)", duration: 1.2, stagger: 0.06 }, 0.2)
      // camera push through the field
      .fromTo(q(".node-field"), { z: -200, rotateX: 8 }, { z: 220, rotateX: -4, ease: "none", duration: 2.4 }, 0)
      .to(q(".s2-copy"), { opacity: 0, y: -30, ease: "power2.in", duration: 0.8 }, ">-0.3");

    // continuous chaotic drift (not scroll-bound)
    q(".risk-node").forEach((el, i) => {
      gsap.to(el, {
        x: `+=${(i % 2 ? 1 : -1) * 18}`,
        y: `+=${(i % 3 - 1) * 14}`,
        duration: 2.5 + (i % 4) * 0.6,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    });
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="problem" className="text-white">
      {/* broken connector lines */}
      <svg className="absolute inset-0 z-0 h-full w-full opacity-40" aria-hidden="true">
        <line x1="14%" y1="24%" x2="50%" y2="42%" stroke="#f0563f" strokeWidth="1" strokeDasharray="4 8" />
        <line x1="70%" y1="18%" x2="50%" y2="42%" stroke="#f5b14c" strokeWidth="1" strokeDasharray="4 8" />
        <line x1="80%" y1="60%" x2="60%" y2="80%" stroke="#f0563f" strokeWidth="1" strokeDasharray="4 8" />
      </svg>

      {/* 3D node field */}
      <div className="node-field absolute inset-0 z-[1] [transform-style:preserve-3d]">
        {RISKS.map((r) => {
          const Icon = r.icon;
          const depth = (r.z + 260) / 520; // 0..1 (far..near)
          return (
            <div
              key={r.label}
              className="risk-node absolute flex items-center gap-2 rounded-lg border bg-[#0b0e15]/85 px-3 py-2"
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                transform: `translateZ(${r.z}px)`,
                borderColor: r.tone === "red" ? "rgba(240,86,63,0.4)" : "rgba(245,177,76,0.4)",
                boxShadow: `0 0 24px -6px ${r.tone === "red" ? "rgba(240,86,63,0.5)" : "rgba(245,177,76,0.5)"}`,
                filter: depth < 0.35 ? "blur(1.5px)" : "none",
                opacity: 0.4,
              }}
            >
              <Icon
                className="h-3.5 w-3.5 shrink-0 cx-blink"
                style={{ color: r.tone === "red" ? "#f0563f" : "#f5b14c" }}
                strokeWidth={2}
              />
              <span className="whitespace-nowrap text-[12px] font-medium text-white/85">{r.label}</span>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full cx-blink"
                style={{
                  background: r.tone === "red" ? "#f0563f" : "#f5b14c",
                  boxShadow: `0 0 8px ${r.tone === "red" ? "#f0563f" : "#f5b14c"}`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* copy */}
      <div className="s2-copy relative z-10 mx-auto max-w-2xl text-center">
        <SceneLabel tone="amber" className="mb-5">The risk of speed</SceneLabel>
        <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Automation without governance
          <br />
          creates invisible risk.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-pretty text-base leading-7 text-white/55">
          When AI acts on personal data and third-party systems, no one can answer
          the questions that matter: what ran, who approved it, and what evidence
          remains.
        </p>
        <p className="mt-6 font-mono text-sm text-white/40">
          <span className="text-[#f5b14c]">{"// "}</span>
          AI workflows should not run in the dark.
        </p>
      </div>
    </PinnedScene>
  );
}
