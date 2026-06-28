"use client";

import React from "react";
import { gsap } from "gsap";
import {
  Ban,
  Cpu,
  EyeOff,
  KeyRound,
  Lock,
  Monitor,
  ScanLine,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";

const PRINCIPLES = [
  { icon: ServerCog, text: "Server-side token resolution" },
  { icon: KeyRound, text: "Vault-backed secret references" },
  { icon: ShieldCheck, text: "Scoped execution" },
  { icon: EyeOff, text: "No raw token exposure" },
  { icon: ScanLine, text: "Redacted logs" },
  { icon: Lock, text: "Least privilege" },
];

export function CredentialVaultScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".vault-core"), { scale: 0.6, opacity: 0 });
    gsap.set(q(".vault-ring"), { scale: 0.7, opacity: 0 });
    gsap.set(q(".vault-side"), { opacity: 0, scale: 0.8 });
    gsap.set(q(".vault-copy"), { opacity: 0, y: 24 });
    gsap.set(q(".tok-block"), { opacity: 0, x: 0 });
    gsap.set(q(".tok-ok"), { opacity: 0, x: 0 });
    gsap.set(q(".blocked-tag"), { opacity: 0, scale: 0.6 });
    gsap.set(q(".ok-tag"), { opacity: 0, scale: 0.6 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1700",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    tl.to(q(".vault-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 1 }, 0)
      .to(q(".vault-ring"), { scale: 1, opacity: 1, ease: "power2.out", duration: 1.2 }, 0.1)
      .to(q(".vault-core"), { scale: 1, opacity: 1, ease: "back.out(1.6)", duration: 1 }, 0.3)
      .to(q(".vault-side"), { opacity: 1, scale: 1, ease: "power2.out", duration: 0.8, stagger: 0.15 }, 0.5)
      // token tries to escape to the browser, gets blocked
      .to(q(".tok-block"), { opacity: 1, duration: 0.2 }, 1.1)
      .to(q(".tok-block"), { x: -118, ease: "power1.in", duration: 0.7 }, 1.1)
      .to(q(".tok-block"), { x: -150, duration: 0.2, ease: "power3.out", yoyo: true, repeat: 1 }, 1.8)
      .to(q(".blocked-tag"), { opacity: 1, scale: 1, ease: "back.out(2)", duration: 0.4 }, 1.9)
      .to(q(".tok-block"), { opacity: 0, duration: 0.4 }, 2.3)
      // scoped token flows to the runtime, allowed
      .to(q(".tok-ok"), { opacity: 1, duration: 0.2 }, 2.3)
      .to(q(".tok-ok"), { x: 118, ease: "power2.inOut", duration: 0.9 }, 2.3)
      .to(q(".ok-tag"), { opacity: 1, scale: 1, ease: "back.out(2)", duration: 0.4 }, 3.0)
      .to(q(".vault-core"), { boxShadow: "0 0 60px -6px rgba(52,211,153,0.7)", duration: 0.6 }, 3.0);

    // soft pulse on the core
    gsap.to(q(".vault-core"), { scale: 1.04, duration: 1.6, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 1.4 });
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="security" className="text-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        {/* copy */}
        <div className="vault-copy">
          <SceneLabel tone="brand" className="mb-5">Credential boundary</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Credentials stay behind the boundary.
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
            Connector secrets should never casually appear in frontend responses,
            workflow outputs, or AI prompts. Corelyx treats credential access as a
            protected runtime boundary.
          </p>
          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            {PRINCIPLES.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.text} className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-[#f05a28]" strokeWidth={1.75} />
                  <span className="text-[12px] text-white/70">{p.text}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* vault stage */}
        <div className="relative mx-auto h-[380px] w-full max-w-[460px]">
          {/* boundary ring */}
          <div className="vault-ring absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f05a28]/30 shadow-[inset_0_0_60px_-10px_rgba(240,90,40,0.4)]" />
          <div className="vault-ring absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f05a28]/15" />

          {/* browser (outside, left) */}
          <div className="vault-side absolute left-0 top-1/2 -translate-y-1/2 rounded-xl border border-white/12 bg-[#0b0e15]/90 px-3 py-2.5 text-center">
            <Monitor className="mx-auto h-4 w-4 text-white/50" strokeWidth={1.5} />
            <p className="mt-1 text-[10px] font-medium text-white/60">Browser</p>
          </div>

          {/* runtime (outside, right) */}
          <div className="vault-side absolute right-0 top-1/2 -translate-y-1/2 rounded-xl border border-[#34d399]/25 bg-[#0b0e15]/90 px-3 py-2.5 text-center">
            <Cpu className="mx-auto h-4 w-4 text-[#34d399]" strokeWidth={1.5} />
            <p className="mt-1 text-[10px] font-medium text-white/60">Runtime</p>
          </div>

          {/* vault core */}
          <div className="vault-core absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-[#f05a28]/50 bg-[#f05a28]/[0.1] shadow-[0_0_50px_-8px_rgba(240,90,40,0.7)]">
            <Lock className="h-7 w-7 text-[#f05a28]" strokeWidth={1.75} />
            <span className="mt-1 font-mono text-[8px] uppercase tracking-widest text-[#ffb799]">vault</span>
          </div>

          {/* tokens */}
          <div className="tok-block absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <span className="block h-3 w-3 rounded-full bg-[#f0563f] shadow-[0_0_14px_rgba(240,86,63,0.9)]" />
          </div>
          <div className="tok-ok absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <span className="block h-3 w-3 rounded-full bg-[#34d399] shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
          </div>

          {/* tags */}
          <div className="blocked-tag absolute left-[6%] top-[30%] z-30 flex items-center gap-1 rounded-md border border-[#f0563f]/40 bg-[#1a0c0a]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#ffb0a3]">
            <Ban className="h-3 w-3" /> Token blocked
          </div>
          <div className="ok-tag absolute right-[4%] top-[64%] z-30 flex items-center gap-1 rounded-md border border-[#34d399]/40 bg-[#08160f]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#7ff0c4]">
            <ShieldCheck className="h-3 w-3" /> Scoped access
          </div>

          {/* external services */}
          <div className="vault-side absolute left-1/2 top-0 flex -translate-x-1/2 gap-1.5">
            {["Gmail", "Slack", "CRM"].map((s) => (
              <span key={s} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[8px] text-white/45">{s}</span>
            ))}
          </div>
          <div className="vault-side absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-1.5">
            {["Webhooks", "AI models"].map((s) => (
              <span key={s} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[8px] text-white/45">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </PinnedScene>
  );
}
