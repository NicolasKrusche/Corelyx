"use client";

import React from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ArrowRight, CalendarCheck, ShieldCheck, Workflow } from "lucide-react";
import { PinnedScene, SignalCanvas, useScene, usePrefersReducedMotion } from "./scene-kit";
import { SystemGraph } from "./SystemGraph";

const FLOW = ["Signal", "Graph", "Policy", "Approval", "Runtime", "Evidence"];

export function FinalSystemRevealScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    const edges = q(".sg-edge");
    gsap.set(edges, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(q(".fr-graph"), { opacity: 0, scale: 1.1 });
    gsap.set(q(".fr-signal"), { opacity: 0.9 });
    gsap.set(q(".fr-content > *"), { opacity: 0, y: 26 });
    gsap.set(q(".fr-chip"), { opacity: 0, scale: 0.8 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1500",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    tl.to(q(".fr-signal"), { opacity: 0.18, scale: 1.3, ease: "power2.inOut", duration: 1.6 }, 0)
      .to(q(".fr-graph"), { opacity: 0.35, scale: 1, ease: "power2.out", duration: 1.6 }, 0.2)
      .to(edges, { strokeDashoffset: 0, ease: "power1.inOut", duration: 1.4, stagger: 0.08 }, 0.4)
      .to(q(".fr-chip"), { opacity: 1, scale: 1, ease: "back.out(1.6)", duration: 0.5, stagger: 0.08 }, 1)
      .to(q(".fr-content > *"), { opacity: 1, y: 0, ease: "power3.out", duration: 0.8, stagger: 0.12 }, 1.2);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="get-started" className="text-white">
      {/* calmed signal */}
      <div className="fr-signal absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/2 h-[50vh] w-[120vw] -translate-x-1/2 -translate-y-1/2">
          <SignalCanvas intensity={0.8} hue="#34d399" />
        </div>
      </div>

      {/* full governed system behind the CTA */}
      <div className="fr-graph pointer-events-none absolute left-1/2 top-1/2 w-[92%] max-w-3xl -translate-x-1/2 -translate-y-1/2">
        <SystemGraph variant="final" showMarkers />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <div className="fr-content">
          {/* resolved flow */}
          <div className="mb-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
            {FLOW.map((node, i) => (
              <React.Fragment key={node}>
                <span className="fr-chip rounded-full border border-[#34d399]/30 bg-[#34d399]/[0.07] px-3 py-1 font-mono text-[11px] tracking-wide text-[#7ff0c4]">
                  {node}
                </span>
                {i < FLOW.length - 1 && <span aria-hidden="true" className="fr-chip h-px w-5 bg-gradient-to-r from-[#34d399]/50 to-[#38bdf8]/30" />}
              </React.Fragment>
            ))}
          </div>

          <h2 className="text-balance text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            Build AI workflows
            <br />
            your team can trust.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-white/60 sm:text-lg">
            Design, review, and run compliance-first automations with approval
            gates, credential boundaries, and audit-ready execution evidence.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="mailto:support@corelyx.app?subject=Book%20a%20Corelyx%20demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f05a28] px-7 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(240,90,40,0.8)] transition-opacity hover:opacity-90 sm:w-auto"
            >
              <CalendarCheck className="h-4 w-4" />
              Book a demo
            </a>
            <Link
              href="/security"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] sm:w-auto"
            >
              <ShieldCheck className="h-4 w-4" />
              Security architecture
            </Link>
            <Link
              href="/templates"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] sm:w-auto"
            >
              <Workflow className="h-4 w-4" />
              Workflow templates
            </Link>
          </div>

          <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.25em] text-white/30">
            EU-hosted · Free plan · No credit card
          </p>
        </div>
      </div>
    </PinnedScene>
  );
}
