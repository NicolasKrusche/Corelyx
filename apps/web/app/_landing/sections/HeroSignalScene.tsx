"use client";

import React from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { PinnedScene, SignalCanvas, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { useWebglStage } from "../three/CinematicStage";
import { reportSceneProgress } from "../three/scroll-state";

const TITLE_1 = ["AI", "workflows", "need", "more", "than", "automation."];
const TITLE_2 = ["They", "need", "control."];
// Per-word gradient stops that read as one continuous white→cyan sweep.
// (background-clip:text must live on the span that owns the text — WebKit
// won't paint a parent's clipped gradient through inline-block word masks.)
const TITLE_2_GRADIENTS = [
  "from-white to-[#d9e9ff]",
  "from-[#d9e9ff] to-[#8fd0fb]",
  "from-[#8fd0fb] to-[#38bdf8]",
];

export function HeroSignalScene() {
  const reduced = usePrefersReducedMotion();
  const webgl = useWebglStage();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);

    // Word-by-word intro
    gsap.from(q(".hero-word"), {
      yPercent: 120,
      opacity: 0,
      duration: 1,
      ease: "expo.out",
      stagger: 0.06,
      delay: 0.2,
    });
    gsap.from(q(".hero-fade"), { opacity: 0, y: 24, duration: 1, ease: "power3.out", stagger: 0.15, delay: 0.8 });

    // Scroll-driven push-in + fragment
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1100",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("hero"),
      },
    });
    tl.to(q(".hero-content"), { y: -80, opacity: 0, filter: "blur(10px)", ease: "power2.in", duration: 1.2 }, 0)
      .to(q(".hero-signal"), { scale: 1.5, opacity: 0.15, ease: "power2.in", duration: 1.6 }, 0)
      .to(q(".hero-fragments"), { opacity: 1, ease: "power2.out", duration: 1 }, 0.3)
      .to(q(".hero-frag"), { x: (i) => (i % 2 ? 1 : -1) * (120 + i * 30), y: (i) => (i % 3 - 1) * 120, opacity: 1, scale: 1, ease: "power2.out", duration: 1.4, stagger: 0.03 }, 0.3);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="top" className="text-white">
      {/* signal — the WebGL stage renders the real ribbon; this 2D canvas is
          the fallback for reduced motion / no WebGL and fades away otherwise */}
      <div className="hero-signal absolute inset-0 z-0">
        <div
          className="absolute left-1/2 top-1/2 h-[60vh] w-[120vw] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700"
          style={{ opacity: webgl ? 0 : 1 }}
        >
          <SignalCanvas intensity={1.1} />
        </div>
        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[920px] -translate-x-1/2 -translate-y-1/2"
          style={{ background: "radial-gradient(ellipse, rgba(29,78,156,0.22) 0%, transparent 65%)" }}
        />
      </div>

      {/* fragments that scatter on scroll (pre-echo of the node field) */}
      <div className="hero-fragments pointer-events-none absolute inset-0 z-[1] flex items-center justify-center opacity-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="hero-frag absolute h-2 w-2 rounded-full"
            style={{
              background: i % 4 === 0 ? "#f5b14c" : i % 5 === 0 ? "#f0563f" : "#38bdf8",
              boxShadow: "0 0 12px currentColor",
              opacity: 0.2,
              transform: "scale(0.5)",
            }}
          />
        ))}
      </div>

      {/* content */}
      <div className="hero-content relative z-10 mx-auto max-w-3xl text-center">
        {/* soft dark pocket so the copy stays readable over the signal */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-28 -inset-y-16 -z-10"
          style={{ background: "radial-gradient(ellipse at center, rgba(5,6,10,0.75) 0%, rgba(5,6,10,0.4) 55%, transparent 78%)" }}
        />
        <div className="hero-fade mb-6 flex justify-center">
          <SceneLabel tone="cyan">EU-native · Compliance-first AI automation</SceneLabel>
        </div>
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.5rem]">
          <span className="block">
            {TITLE_1.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden align-bottom">
                <span className="hero-word inline-block">{w}</span>
                {i < TITLE_1.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
              </span>
            ))}
          </span>
          <span className="mt-1 block">
            {TITLE_2.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden align-bottom">
                <span
                  className={`hero-word inline-block bg-gradient-to-r bg-clip-text text-transparent ${TITLE_2_GRADIENTS[i] ?? "from-white to-[#38bdf8]"}`}
                >
                  {w}
                </span>
                {i < TITLE_2.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
              </span>
            ))}
          </span>
        </h1>

        <p className="hero-fade mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-white/60 sm:text-lg">
          Corelyx helps European teams design, review, and run compliance-first AI
          automations with approval gates, credential boundaries, and audit-ready
          execution evidence.
        </p>

        <div className="hero-fade mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="mailto:support@corelyx.app?subject=Book%20a%20Corelyx%20demo"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f05a28] px-7 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(240,90,40,0.8)] transition-opacity hover:opacity-90 sm:w-auto"
          >
            <CalendarCheck className="h-4 w-4" />
            Book a demo
          </a>
          <Link
            href="#platform"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] sm:w-auto"
          >
            Explore platform
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </PinnedScene>
  );
}
