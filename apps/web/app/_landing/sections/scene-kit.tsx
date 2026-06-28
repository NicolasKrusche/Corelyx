"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
   Cinematic scene kit — shared infrastructure for the scroll-driven Corelyx
   "product film". Pseudo-3D via CSS perspective + GSAP ScrollTrigger scrubs +
   a lightweight canvas particle field. Everything degrades to a readable
   static state under prefers-reduced-motion.
   ──────────────────────────────────────────────────────────────────────── */

export const SCENE = {
  brand: "#f05a28",
  brandSoft: "#ff7a4d",
  cyan: "#38bdf8",
  blue: "#5b8cff",
  green: "#34d399",
  amber: "#f5b14c",
  red: "#f0563f",
  ink: "#05060a",
} as const;

let registered = false;
export function registerGsap() {
  if (typeof window !== "undefined" && !registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
}

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** SSR-safe prefers-reduced-motion. Defaults to false on the server. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** SSR-safe "is this a small screen" flag for mobile simplification. */
export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setMobile(mq.matches);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return mobile;
}

/**
 * Run a GSAP setup inside a scoped context with automatic cleanup. The setup
 * receives the scoped element. Skipped entirely when reduced motion is on (the
 * scene should render its resolved/static state in that case).
 */
export function useScene(
  setup: (scope: HTMLElement, ctx: gsap.Context) => void,
  options: { enabled?: boolean; deps?: React.DependencyList } = {},
) {
  const { enabled = true, deps = [] } = options;
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    registerGsap();
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const ctx = gsap.context((self) => setup(el, self), el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return ref;
}

/** Full-viewport pinned scene shell. */
export function PinnedScene({
  id,
  sceneRef,
  children,
  className,
}: {
  id?: string;
  sceneRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      ref={sceneRef}
      className={cn(
        "scene relative flex min-h-screen w-full items-center justify-center overflow-hidden px-5 sm:px-8",
        className,
      )}
      style={{ perspective: "1400px" }}
    >
      {children}
    </section>
  );
}

/** A glowing workflow node chip used across scenes (pseudo-3D card). */
export function NodeChip({
  icon,
  label,
  sub,
  state = "idle",
  className,
  style,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  state?: "idle" | "done" | "running" | "review" | "blocked" | "secure";
  className?: string;
  style?: React.CSSProperties;
}) {
  const ring: Record<string, string> = {
    idle: "border-white/12",
    done: "border-[#34d399]/45 shadow-[0_0_24px_-6px_rgba(52,211,153,0.45)]",
    running: "border-[#38bdf8]/55 shadow-[0_0_24px_-6px_rgba(56,189,248,0.5)]",
    review: "border-[#f5b14c]/55 shadow-[0_0_24px_-6px_rgba(245,177,76,0.5)]",
    blocked: "border-[#f0563f]/55 shadow-[0_0_24px_-6px_rgba(240,86,63,0.5)]",
    secure: "border-[#f05a28]/50 shadow-[0_0_28px_-6px_rgba(240,90,40,0.55)]",
  };
  const dot: Record<string, string> = {
    idle: "bg-white/25",
    done: "bg-[#34d399] shadow-[0_0_8px_rgba(52,211,153,0.9)]",
    running: "bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.9)]",
    review: "bg-[#f5b14c] shadow-[0_0_8px_rgba(245,177,76,0.9)]",
    blocked: "bg-[#f0563f] shadow-[0_0_8px_rgba(240,86,63,0.9)]",
    secure: "bg-[#f05a28] shadow-[0_0_8px_rgba(240,90,40,0.9)]",
  };
  return (
    <div
      className={cn(
        "flex w-[156px] items-center gap-2.5 rounded-xl border bg-[#0b0e15]/92 p-2.5",
        ring[state],
        className,
      )}
      style={style}
    >
      {icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#38bdf8]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold leading-tight text-white">{label}</span>
        {sub ? <span className="block truncate font-mono text-[9px] text-white/40">{sub}</span> : null}
      </span>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot[state])} />
    </div>
  );
}

/**
 * Lightweight canvas particle "AI signal" — a flowing ribbon of glowing points.
 * Pauses when offscreen, thins out on mobile, and renders a single static
 * frame under reduced motion. `intensity` scales particle count.
 */
export function SignalCanvas({
  className,
  intensity = 1,
  hue = SCENE.cyan,
}: {
  className?: string;
  intensity?: number;
  hue?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const count = Math.round((mobile ? 60 : 150) * intensity);
    type P = { x: number; y: number; phase: number; speed: number; amp: number; r: number; band: number };
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: h / 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.6,
        amp: (h / 5) * (0.4 + Math.random() * 0.9),
        r: 0.6 + Math.random() * 1.8,
        band: 0.5 + Math.random() * 1.5,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.x += p.speed;
        if (p.x > w + 20) p.x = -20;
        const wave = Math.sin((p.x / w) * Math.PI * 2 * p.band + p.phase + t * 0.0006);
        const y = h / 2 + wave * p.amp * 0.5;
        const glow = ctx.createRadialGradient(p.x, y, 0, p.x, y, p.r * 6);
        glow.addColorStop(0, hue);
        glow.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(p.x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (running && !reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);

    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running && !reduced) {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(draw);
        } else {
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    if (reduced) {
      draw(0); // single static frame
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      io.disconnect();
    };
  }, [intensity, hue, reduced, mobile]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("h-full w-full", className)} />;
}

/** Mono eyebrow used by scenes (cinematic variant). */
export function SceneLabel({
  children,
  tone = "cyan",
  className,
}: {
  children: React.ReactNode;
  tone?: "cyan" | "brand" | "amber" | "green" | "muted";
  className?: string;
}) {
  const color =
    tone === "brand"
      ? "text-[#ff7a4d]"
      : tone === "amber"
        ? "text-[#f5b14c]"
        : tone === "green"
          ? "text-[#34d399]"
          : tone === "muted"
            ? "text-white/45"
            : "text-[#38bdf8]";
  return (
    <p className={cn("font-mono text-[11px] font-medium uppercase tracking-[0.28em]", color, className)}>
      {children}
    </p>
  );
}
