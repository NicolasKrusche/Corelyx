"use client";

import React from "react";
import { gsap } from "gsap";
import {
  Bot,
  Database,
  FileCheck2,
  GitFork,
  Mail,
  Play,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { reportSceneProgress } from "../three/scroll-state";

type BNode = { id: string; icon: LucideIcon; label: string; cx: number; cy: number; tone: string };

const BNODES: BNode[] = [
  { id: "trigger", icon: Mail, label: "Email trigger", cx: 7, cy: 34, tone: "#38bdf8" },
  { id: "ai", icon: Bot, label: "AI classify", cx: 24, cy: 66, tone: "#38bdf8" },
  { id: "policy", icon: GitFork, label: "Policy check", cx: 42, cy: 34, tone: "#5b8cff" },
  { id: "approval", icon: ShieldCheck, label: "Approval", cx: 60, cy: 66, tone: "#f5b14c" },
  { id: "crm", icon: Database, label: "CRM update", cx: 78, cy: 34, tone: "#38bdf8" },
  { id: "evidence", icon: FileCheck2, label: "Audit record", cx: 88, cy: 66, tone: "#34d399" },
];
const BEDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
];

const CONFIG = [
  ["Node", "Approval gate"],
  ["Reviewers", "Ops team"],
  ["Trigger when", "Personal data"],
  ["On reject", "Halt + log"],
];

export function WorkflowBuilderScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".bld-card"), { rotateX: 14, y: 60, opacity: 0, transformOrigin: "center 80%" });
    gsap.set(q(".bld-node"), { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.6 });
    gsap.set(q(".bld-edge"), { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(q(".bld-panel"), { xPercent: 8, opacity: 0 });
    gsap.set(q(".bld-config"), { opacity: 0, x: 12 });
    gsap.set(q(".bld-status"), { opacity: 0, y: 8 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1700",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("builder"),
      },
    });

    tl.to(q(".bld-card"), { rotateX: 0, y: 0, opacity: 1, ease: "power3.out", duration: 1.4 }, 0)
      .to(q(".bld-node"), { opacity: 1, scale: 1, ease: "back.out(1.5)", duration: 0.8, stagger: 0.12 }, 0.4)
      .to(q(".bld-edge"), { strokeDashoffset: 0, ease: "power1.inOut", duration: 0.6, stagger: 0.12 }, 0.5)
      .to(q(".bld-panel"), { xPercent: 0, opacity: 1, ease: "power3.out", duration: 1 }, 0.9)
      .to(q(".bld-config"), { opacity: 1, x: 0, ease: "power2.out", duration: 0.6, stagger: 0.08 }, 1.1)
      // status cycle Draft -> Ready -> Review required
      .to(q(".bld-status-draft"), { opacity: 1, y: 0, duration: 0.4 }, 1.0)
      .to(q(".bld-status-draft"), { opacity: 0, y: -8, duration: 0.4 }, 1.7)
      .to(q(".bld-status-ready"), { opacity: 1, y: 0, duration: 0.4 }, 1.7)
      .to(q(".bld-status-ready"), { opacity: 0, y: -8, duration: 0.4 }, 2.4)
      .to(q(".bld-status-review"), { opacity: 1, y: 0, duration: 0.4 }, 2.4)
      .to(q("[data-bld='approval']"), { boxShadow: "0 0 30px -4px rgba(245,177,76,0.7)", borderColor: "rgba(245,177,76,0.7)", duration: 0.6 }, 2.4);

    // the builder floats gently in space (not scroll-bound)
    gsap.to(q(".bld-float"), {
      y: "+=10",
      rotateX: "-=0.6",
      duration: 3.4,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="workflows" className="text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <SceneLabel tone="cyan" className="mb-4">Visual workflow builder</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Build visually. Execute with structure.
          </h2>
        </div>

        <div className="bld-float" style={{ perspective: "1400px" }}>
          <div className="bld-card overflow-hidden rounded-2xl border border-white/12 bg-[#070a10]/95 shadow-[0_50px_140px_-40px_rgba(0,0,0,0.95)] [transform-style:preserve-3d]">
            {/* chrome */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f0563f]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f5b14c]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/70" />
                <span className="ml-3 font-mono text-[11px] text-white/40">corelyx · support-triage.flow</span>
              </div>
              <div className="relative h-6 w-[120px]">
                <span className="bld-status bld-status-draft absolute right-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55">Draft</span>
                <span className="bld-status bld-status-ready absolute right-0 inline-flex items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#a5e3ff]">Ready</span>
                <span className="bld-status bld-status-review absolute right-0 inline-flex items-center gap-1.5 rounded-full border border-[#f5b14c]/30 bg-[#f5b14c]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffd79a]">Review required</span>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr_240px]">
              {/* canvas */}
              <div className="relative h-[300px] overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px] sm:h-[360px] lg:border-b-0 lg:border-r">
                <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="bldEdge" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#f05a28" stopOpacity="0.6" />
                    </linearGradient>
                  </defs>
                  {BEDGES.map(([a, b]) => {
                    const p1 = BNODES[a];
                    const p2 = BNODES[b];
                    const mx = (p1.cx + p2.cx) / 2;
                    return (
                      <path
                        key={`${a}-${b}`}
                        className="bld-edge"
                        d={`M ${p1.cx} ${p1.cy} C ${mx} ${p1.cy}, ${mx} ${p2.cy}, ${p2.cx} ${p2.cy}`}
                        fill="none"
                        stroke="url(#bldEdge)"
                        strokeWidth={1.5}
                        pathLength={1}
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>
                {BNODES.map((n) => {
                  const Icon = n.icon;
                  return (
                    <div
                      key={n.id}
                      data-bld={n.id}
                      className="bld-node absolute z-10 flex w-[104px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#0c1018]/95 p-1.5"
                      style={{ left: `${n.cx}%`, top: `${n.cy}%` }}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]" style={{ color: n.tone }}>
                        <Icon className="h-3 w-3" strokeWidth={2} />
                      </span>
                      <span className="truncate text-[10px] font-semibold text-white">{n.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* config panel (closer to camera) */}
              <div className="bld-panel bg-[#080b11] p-4" style={{ transform: "translateZ(40px)" }}>
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/35">Node configuration</p>
                <div className="mt-3 space-y-2.5">
                  {CONFIG.map(([k, v]) => (
                    <div key={k} className="bld-config flex items-center justify-between gap-2">
                      <span className="text-[11px] text-white/40">{k}</span>
                      <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-white/70">{v}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#f05a28] px-3 py-2 text-[12px] font-semibold text-white">
                  <Play className="h-3.5 w-3.5" /> Run workflow
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[12px] text-white/40">
          Draft → Ready → Review required · the run pauses before sensitive actions.
        </p>
      </div>
    </PinnedScene>
  );
}
