"use client";

import React from "react";
import Link from "next/link";
import { gsap } from "gsap";
import {
  ArrowRight,
  Building2,
  FileText,
  Globe2,
  Lock,
  Scale,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { reportSceneProgress } from "../three/scroll-state";

/* Scene 11 — trust layer. Calmer than the film before it, but still spatial:
   the review documents drift in scattered (like loose paperwork) and organize
   themselves into clean rows as the section scrolls, with a verification line
   drawing under the heading. Scrubbed, not pinned. */

const TRUST = [
  { icon: Lock, label: "Privacy policy", href: "/privacy", hint: "What we collect, why, and for how long." },
  { icon: FileText, label: "DPA", href: "/dpa", hint: "Data processing agreement for customers." },
  { icon: ServerCog, label: "Subprocessors", href: "/subprocessors", hint: "The vendors in our processing chain." },
  { icon: ShieldCheck, label: "Security architecture", href: "/security", hint: "How credentials, runtime, and data are isolated." },
  { icon: Scale, label: "GDPR workflows", href: "/gdpr", hint: "How Corelyx supports GDPR obligations." },
  { icon: ScrollText, label: "AI Act workflows", href: "/ai-act", hint: "Risk classification and oversight controls." },
  { icon: Globe2, label: "Data residency", href: "/data-residency", hint: "Where your data is stored and processed." },
  { icon: Building2, label: "Terms", href: "/terms", hint: "The terms that govern using Corelyx." },
  { icon: Users, label: "Vulnerability contact", href: "/security", hint: "Report a security issue responsibly." },
] as const;

/** Deterministic "loose paperwork" scatter per card. */
function scatter(i: number) {
  return {
    y: 70 + (i % 3) * 26,
    z: -140 - (i % 4) * 70,
    rotate: ((i * 37) % 7) - 3,
    rotateX: 8,
  };
}

export function TrustLayerScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    gsap.set(q(".tr-head"), { opacity: 0, y: 24 });
    gsap.set(q(".tr-cta"), { opacity: 0, y: 16 });
    gsap.set(q(".tr-verify"), { scaleX: 0 });
    (q(".tr-card") as HTMLElement[]).forEach((el, i) => {
      gsap.set(el, { opacity: 0, filter: "blur(4px)", ...scatter(i) });
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top 78%",
        end: "bottom 75%",
        scrub: 0.7,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("trust"),
      },
    });

    tl.to(q(".tr-head"), { opacity: 1, y: 0, ease: "power3.out", duration: 0.8 }, 0)
      .to(q(".tr-verify"), { scaleX: 1, ease: "power1.inOut", duration: 0.8 }, 0.3)
      .to(q(".tr-card"), {
        opacity: 1,
        y: 0,
        z: 0,
        rotate: 0,
        rotateX: 0,
        filter: "blur(0px)",
        ease: "power3.out",
        duration: 1,
        stagger: 0.07,
      }, 0.35)
      .to(q(".tr-cta"), { opacity: 1, y: 0, ease: "power2.out", duration: 0.6 }, 1.3);
  }, { enabled: !reduced });

  return (
    <section
      id="trust"
      ref={ref}
      className="scene relative w-full overflow-hidden px-5 py-28 text-white sm:px-8"
      style={{ perspective: "1400px" }}
    >
      {/* calmer graphite wash to mark the transition */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b1018]/0 via-[#10151f]/60 to-[#0b1018]/0" />

      <div className="relative mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="tr-head max-w-2xl">
            <SceneLabel tone="cyan" className="mb-5">Trust &amp; compliance</SceneLabel>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              Built for review, not just demos.
            </h2>
            <p className="mt-5 text-pretty text-base leading-7 text-white/55">
              Corelyx makes security, privacy, data processing, subprocessors,
              residency context, and workflow governance easy to inspect.
            </p>
            <span
              className="tr-verify mt-6 block h-px w-full max-w-md origin-left bg-gradient-to-r from-[#38bdf8]/60 via-[#34d399]/40 to-transparent"
              aria-hidden="true"
            />
          </div>
          <div className="tr-cta">
            <Link
              href="/trust"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/[0.06] px-4 py-2 text-sm font-semibold text-[#a5e3ff] transition-colors hover:bg-[#38bdf8]/[0.12]"
            >
              Visit Trust Center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ transformStyle: "preserve-3d" }}>
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="tr-card" style={{ transformStyle: "preserve-3d" }}>
                <Link
                  href={t.href}
                  className="group flex h-full items-start gap-3 rounded-2xl border border-white/10 bg-[#0a0d13]/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#38bdf8]/35 hover:shadow-[0_24px_60px_-30px_rgba(56,189,248,0.4)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0d1119] text-[#38bdf8]">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                      {t.label}
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-white/30 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-white/40">{t.hint}</span>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
