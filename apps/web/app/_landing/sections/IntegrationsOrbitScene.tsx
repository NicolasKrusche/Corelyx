"use client";

import React from "react";
import { gsap } from "gsap";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Github,
  Headset,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
} from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { reportSceneProgress } from "../three/scroll-state";

/* Scene 9 — integrations orbit. A continuous 2.5D orbit of external tools
   around the Corelyx core. On scroll, one integration (CRM) is pulled out of
   orbit toward the boundary, its connection passes an approval gate on the
   boundary ring, the gate approves, and an evidence record appears. */

const ORBIT = [
  { icon: Mail, label: "Email" },
  { icon: MessageSquare, label: "Slack / Teams" },
  { icon: Users, label: "CRM" }, // ← the focused integration
  { icon: FileText, label: "Documents" },
  { icon: Database, label: "Databases" },
  { icon: Webhook, label: "Webhooks" },
  { icon: Sparkles, label: "AI models" },
  { icon: Headset, label: "Support" },
  { icon: Github, label: "Developer" },
  { icon: ClipboardList, label: "Forms" },
] as const;

const FOCUS_INDEX = 2;
const RX = 185;
const RY = 62;
const ANCHOR_X = 95;
const ANCHOR_Y = -35;

function initialPlacement(i: number) {
  const a = (i / ORBIT.length) * Math.PI * 2;
  const x = Math.round(Math.cos(a) * RX);
  const y = Math.round(Math.sin(a) * RY);
  const depth = (Math.sin(a) + 1) / 2;
  const scale = (0.7 + depth * 0.32).toFixed(2);
  const opacity = (0.35 + depth * 0.65).toFixed(2);
  return {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
    opacity: Number(opacity),
    zIndex: 10 + Math.round(depth * 10),
  };
}

export function IntegrationsOrbitScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    const items = q(".orb-item") as HTMLElement[];
    const spin = { t: 0 };
    const spawn = { v: 0 };
    const focus = { v: 0 };
    const baseAngles = ORBIT.map((_, i) => (i / ORBIT.length) * Math.PI * 2);

    const layout = () => {
      items.forEach((el, i) => {
        const a = baseAngles[i] + spin.t;
        const ox = Math.cos(a) * RX;
        const oy = Math.sin(a) * RY;
        const depth = (Math.sin(a) + 1) / 2;
        let x = ox;
        let y = oy;
        let sc = 0.7 + depth * 0.32;
        let op = 0.35 + depth * 0.65;
        if (i === FOCUS_INDEX && focus.v > 0) {
          x = ox + (ANCHOR_X - ox) * focus.v;
          y = oy + (ANCHOR_Y - oy) * focus.v;
          sc += (1.06 - sc) * focus.v;
          op += (1 - op) * focus.v;
        }
        const appear = Math.min(1, Math.max(0, spawn.v * 1.6 - i * 0.05));
        gsap.set(el, {
          xPercent: -50,
          yPercent: -50,
          x,
          y,
          scale: sc * (0.4 + 0.6 * appear),
          opacity: op * appear,
          zIndex: 10 + Math.round(depth * 10) + (i === FOCUS_INDEX ? Math.round(focus.v * 20) : 0),
        });
      });
    };

    // continuous revolution (auto-killed with the gsap context)
    gsap.to(spin, { t: Math.PI * 400, duration: (Math.PI * 400) / 0.14, ease: "none", onUpdate: layout });
    layout();

    gsap.set(q(".orb-copy"), { opacity: 0, y: 24 });
    gsap.set(q(".orb-badge"), { opacity: 0, x: -16 });
    gsap.set(q(".orb-ring"), { opacity: 0, scale: 0.85 });
    gsap.set(q(".orb-core"), { opacity: 0, scale: 0.7 });
    gsap.set(q(".orb-line"), { strokeDasharray: 1, strokeDashoffset: 1, stroke: "rgba(245,177,76,0.7)" });
    gsap.set(q(".orb-gate-pending"), { opacity: 0, scale: 0.6 });
    gsap.set(q(".orb-gate-ok"), { opacity: 0, scale: 0.6 });
    gsap.set(q(".orb-evidence"), { opacity: 0, y: 10 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1600",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("orbit"),
      },
    });

    tl.to(q(".orb-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 0.9 }, 0)
      .to(q(".orb-ring"), { opacity: 1, scale: 1, ease: "power2.out", duration: 1, stagger: 0.15 }, 0.1)
      .to(q(".orb-core"), { opacity: 1, scale: 1, ease: "back.out(1.5)", duration: 0.9 }, 0.3)
      .to(spawn, { v: 1, duration: 1.3, ease: "none", onUpdate: layout }, 0.3)
      .to(q(".orb-badge"), { opacity: 1, x: 0, ease: "power2.out", duration: 0.5, stagger: 0.12 }, 1.0)
      // CRM leaves the orbit and approaches the boundary
      .to(focus, { v: 1, duration: 0.9, ease: "power2.inOut", onUpdate: layout }, 1.5)
      .to(q(".orb-line"), { strokeDashoffset: 0, ease: "power1.inOut", duration: 0.7 }, 2.0)
      .to(q(".orb-gate-pending"), { opacity: 1, scale: 1, ease: "back.out(1.8)", duration: 0.4 }, 2.3)
      // the gate approves; the connection goes green; evidence is written
      .to(q(".orb-gate-pending"), { opacity: 0, scale: 0.7, duration: 0.3 }, 3.0)
      .to(q(".orb-gate-ok"), { opacity: 1, scale: 1, ease: "back.out(1.8)", duration: 0.4 }, 3.0)
      .to(q(".orb-line"), { stroke: "rgba(52,211,153,0.7)", duration: 0.4 }, 3.0)
      .to(q(".orb-core"), { boxShadow: "0 0 60px -6px rgba(52,211,153,0.6)", duration: 0.5 }, 3.1)
      .to(q(".orb-evidence"), { opacity: 1, y: 0, ease: "back.out(1.6)", duration: 0.5 }, 3.3);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="integrations" className="text-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        {/* copy */}
        <div>
          <div className="orb-copy">
            <SceneLabel tone="cyan" className="mb-5">Integrations</SceneLabel>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              Connect your tools.
              <br />
              <span className="text-white/45">Keep control in the middle.</span>
            </h2>
            <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
              Corelyx connects workflows across services while preserving approval
              gates, credential boundaries, and execution records.
            </p>
          </div>

          <div className="mt-7 space-y-2.5">
            <div className="orb-badge flex items-center gap-2.5 rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.06] px-3.5 py-3">
              <CheckCircle2 className="h-4 w-4 text-[#34d399]" />
              <span className="text-[12.5px] text-[#7ff0c4]">Verified webhook · signature checked</span>
            </div>
            <div className="orb-badge flex items-center gap-2.5 rounded-xl border border-[#f0563f]/25 bg-[#f0563f]/[0.06] px-3.5 py-3">
              <Ban className="h-4 w-4 text-[#f0563f]" />
              <span className="text-[12.5px] text-[#ffb0a3]">Unverified webhook · rejected before side effects</span>
            </div>
          </div>
        </div>

        {/* orbit stage — fixed 480×420 canvas, scaled responsively so the SVG
            overlay and DOM offsets always agree */}
        <div className="relative mx-auto h-[420px] w-[480px] max-w-full scale-[0.68] sm:scale-90 lg:scale-100">
          {/* orbital paths */}
          <div className="orb-ring absolute left-1/2 top-1/2 h-[124px] w-[370px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/[0.08]" />
          <div className="orb-ring absolute left-1/2 top-1/2 h-[86px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/[0.05]" />
          <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d4e9c]/10 blur-2xl" />

          {/* governance boundary */}
          <div className="orb-ring absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#38bdf8]/30" />

          {/* connection line: focused integration → core (crosses the boundary) */}
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 480 420" aria-hidden="true">
            <line
              className="orb-line"
              x1="335"
              y1="175"
              x2="278"
              y2="196"
              stroke="rgba(52,211,153,0.7)"
              strokeWidth="1.5"
              pathLength={1}
              strokeLinecap="round"
            />
          </svg>

          {/* approval gate on the boundary */}
          <div
            className="orb-gate-pending absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-[#f5b14c]/40 bg-[#171009]/95 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#ffd79a] opacity-0"
            style={{ marginLeft: 70, marginTop: -26 }}
          >
            <ShieldCheck className="h-3 w-3" /> Approval gate
          </div>
          <div
            className="orb-gate-ok absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-[#34d399]/40 bg-[#08160f]/95 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#7ff0c4]"
            style={{ marginLeft: 70, marginTop: -26 }}
          >
            <CheckCircle2 className="h-3 w-3" /> Approved
          </div>

          {/* core */}
          <div className="orb-core absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-[#f05a28]/40 bg-[#0b0e15]/95 shadow-[0_0_50px_-8px_rgba(240,90,40,0.6)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-8 w-8 object-contain" />
            <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#ffb799]">core</span>
          </div>

          {/* evidence record under the core */}
          <div className="orb-evidence absolute left-1/2 top-1/2 z-30 -translate-x-1/2 translate-y-[64px] whitespace-nowrap rounded-md border border-[#34d399]/30 bg-[#08160f]/95 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#7ff0c4]">
            Evidence logged · run_31ac
          </div>

          {/* orbiting integrations */}
          {ORBIT.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="orb-item absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5"
                style={initialPlacement(i)}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#0b0e15] text-white/70 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <span className="font-mono text-[8.5px] uppercase tracking-wider text-white/45">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </PinnedScene>
  );
}
