"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Clock,
  Mail,
  MessagesSquare,
  NotebookPen,
  Send,
  Filter,
  ShieldCheck,
  Radar,
  GitBranch,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Genesis V2 release — "Product film" edition.
// The announcement restyled to the landing page's cinematic language: ink
// #05060a environment, perspective grid, drifting depth particles, a cyan
// signal ribbon, SystemGraph-style node cards, brand-orange CTAs, film grain.
// The palette is hardcoded (like the landing) so it renders identically under
// every app theme. Same camera-dolly stage mechanics as the "Flightdeck"
// edition, but the entrance is the landing hero's: fade + rise + word-by-word
// title reveal. No WebGL.
// ─────────────────────────────────────────────────────────────────────────────

// Stage-space center the camera frames a focus point onto.
const CX = 320;
const CY = 175;

type Cam = { fx: number; fy: number; s: number; ry: number };

// Establishing shot (deep in the scene, small + rotated) → resolves to hero.
const WARP: Cam = { fx: 360, fy: 175, s: 0.28, ry: -34 };

function camStr(c: Cam): string {
  // zoom-to-point: focus (fx,fy) lands exactly at (CX,CY) for any scale/rotate,
  // and rotateY happens about that focus → nodes parallax around it.
  return `translate(${CX}px, ${CY}px) rotateY(${c.ry}deg) scale(${c.s}) translate(${-c.fx}px, ${-c.fy}px)`;
}

type NodeDef = {
  id: string;
  x: number;
  y: number;
  z: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  ghost?: boolean;
};

const NODES: NodeDef[] = [
  { id: "trigger", x: 100, y: 180, z: -30, icon: Clock, label: "Weekday 8am", sub: "schedule" },
  { id: "gmail", x: 270, y: 90, z: 25, icon: Mail, label: "Fetch emails", sub: "gmail" },
  { id: "notion", x: 270, y: 290, z: -25, icon: NotebookPen, label: "Save to Notion", sub: "notion" },
  { id: "slack", x: 470, y: 185, z: 35, icon: MessagesSquare, label: "Post summary", sub: "slack" },
  { id: "report", x: 640, y: 95, z: 0, icon: Send, label: "Send report", sub: "output" },
  { id: "oldfilter", x: 635, y: 285, z: -15, icon: Filter, label: "Old filter", sub: "removed", ghost: true },
];

type EdgeDef = { d: string; ghost?: boolean };

const EDGES: EdgeDef[] = [
  { d: "M100,180 C 175,180 190,90 270,90" },
  { d: "M100,180 C 175,180 190,290 270,290" },
  { d: "M270,90 C 360,90 380,185 470,185" },
  { d: "M270,290 C 360,290 380,185 470,185" },
  { d: "M470,185 C 555,185 560,95 640,95" },
  { d: "M470,185 C 560,185 560,285 635,285", ghost: true },
];

// Eyebrow tones from the landing's SceneLabel.
type Tone = "cyan" | "brand" | "amber" | "green";
const TONE_TEXT: Record<Tone, string> = {
  cyan: "text-[#38bdf8]",
  brand: "text-[#ff7a4d]",
  amber: "text-[#f5b14c]",
  green: "text-[#34d399]",
};

type Beat = { id: string; kicker: string; title: string; cam: Cam; focus: string | null; tone: Tone };

const BEATS: Beat[] = [
  { id: "hero", kicker: "The next generation of Genesis", title: "Genesis, reimagined", cam: { fx: 360, fy: 175, s: 0.82, ry: -6 }, focus: null, tone: "cyan" },
  { id: "accounts", kicker: "Knows your accounts", title: "It reads your real accounts, live", cam: { fx: 270, fy: 90, s: 1.16, ry: 9 }, focus: "gmail", tone: "cyan" },
  { id: "plan", kicker: "Plan, then build", title: "Two phases, reliable on any model", cam: { fx: 360, fy: 175, s: 0.8, ry: 11 }, focus: null, tone: "brand" },
  { id: "asks", kicker: "Asks instead of guessing", title: "It pins the question to the node", cam: { fx: 470, fy: 185, s: 1.14, ry: -9 }, focus: "slack", tone: "amber" },
  { id: "edits", kicker: "Surgical edits you can watch", title: "Every change, animated in place", cam: { fx: 400, fy: 210, s: 0.94, ry: 7 }, focus: null, tone: "green" },
  { id: "private", kicker: "Private by design", title: "Grounded in your data, never exposed", cam: { fx: 360, fy: 175, s: 0.95, ry: 0 }, focus: null, tone: "brand" },
];

const HERO = BEATS[0]!.cam;
const CHIPS = ["Receipts", "Newsletters", "Updates"];
const CHIP_POS: Array<{ top: number; left: number }> = [
  { top: -34, left: 116 },
  { top: 4, left: 128 },
  { top: 42, left: 112 },
];

// ─── Landing hero title sweep, generalized: per-word gradient stops sampled
// from the white → cyan ramp so any title reads as one continuous sweep.
// (background-clip:text must live on the span that owns the text — WebKit
// won't paint a parent's clipped gradient through inline-block word masks.) ───
const RAMP: Array<[number, number, number]> = [
  [255, 255, 255],
  [217, 233, 255],
  [143, 208, 251],
  [56, 189, 248],
];

function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  const ch = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function TitleWords({ title }: { title: string }) {
  const words = title.split(" ");
  const n = words.length;
  return (
    <>
      {words.map((w, i) => (
        <span key={`${title}-${i}`} className="inline-block overflow-hidden align-bottom">
          <span
            className="gvf-word inline-block"
            style={{
              backgroundImage: `linear-gradient(90deg, ${rampColor(i / n)}, ${rampColor((i + 1) / n)})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              animationDelay: `${0.08 + i * 0.05}s`,
            }}
          >
            {w}
          </span>
          {i < n - 1 ? <span className="inline-block">&nbsp;</span> : null}
        </span>
      ))}
    </>
  );
}

// ─── Drifting depth particles — the landing CinematicBackdrop field. ───
function DriftField({ animate, className }: { animate: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type P = { x: number; y: number; z: number; vy: number; r: number };
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 768 ? 26 : 64;
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        vy: -(0.05 + Math.random() * 0.25),
        r: 0.5 + Math.random() * 1.6,
      }));
    };

    const draw = (moving: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (moving) {
          p.y += p.vy;
          if (p.y < -5) {
            p.y = h + 5;
            p.x = Math.random() * w;
          }
        }
        ctx.globalAlpha = 0.1 + p.z * 0.3;
        ctx.fillStyle = p.z > 0.6 ? "#56b8ff" : "#7c8aa6";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + p.z), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (!animate) draw(false);
    });
    ro.observe(canvas);

    if (!animate) {
      draw(false);
      return () => ro.disconnect();
    }
    const loop = () => {
      draw(true);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animate]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

// ─── Signal ribbon — the landing hero's flowing "AI signal" particle band,
// thinned to sit quietly behind the workflow graph. ───
function SignalRibbon({ animate, className }: { animate: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type P = { x: number; phase: number; speed: number; amp: number; r: number; band: number };
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: 46 }, () => ({
        x: Math.random() * w,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.5,
        amp: (h / 5) * (0.4 + Math.random() * 0.9),
        r: 0.5 + Math.random() * 1.4,
        band: 0.5 + Math.random() * 1.5,
      }));
    };

    const draw = (t: number, moving: boolean) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        if (moving) {
          p.x += p.speed;
          if (p.x > w + 20) p.x = -20;
        }
        const wave = Math.sin((p.x / w) * Math.PI * 2 * p.band + p.phase + t * 0.0006);
        const y = h / 2 + wave * p.amp * 0.5;
        const glow = ctx.createRadialGradient(p.x, y, 0, p.x, y, p.r * 6);
        glow.addColorStop(0, "#38bdf8");
        glow.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.5;
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
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (!animate) {
      draw(0, false);
      return () => ro.disconnect();
    }
    const loop = (t: number) => {
      draw(t, true);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animate]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

// Landing-style content chip (rounded-full, white/12 border, cyan icons).
function Pill({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/85">
      {icon}
      {children}
    </span>
  );
}

function NumBadge({ n }: { n: number }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f05a28] text-[9px] font-bold text-white">
      {n}
    </span>
  );
}

function BeatBody({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <>
          <p className="gvf-body">
            The plan-then-build engine that knows your real accounts, asks before it guesses, and lets you watch every
            edit land on the canvas.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill icon={<Radar className="h-3 w-3 text-[#38bdf8]" />}>Knows your accounts</Pill>
            <Pill icon={<GitBranch className="h-3 w-3 text-[#38bdf8]" />}>Plan, then build</Pill>
            <Pill icon={<HelpCircle className="h-3 w-3 text-[#38bdf8]" />}>Asks first</Pill>
          </div>
        </>
      );
    case 1:
      return (
        <p className="gvf-body">
          Genesis introspects your connected accounts while it builds — your real Slack channels, Gmail labels, Notion
          databases — and wires each step to actual resources instead of guessing IDs.{" "}
          <span className="font-medium text-white/90">Metadata and schema only, never your message contents.</span>
        </p>
      );
    case 2:
      return (
        <>
          <p className="gvf-body">
            V2 generates in two passes: first it plans the whole workflow shape, then it resolves each connector&apos;s
            exact operation per provider. That keeps it reliable even on fast, lightweight models.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill icon={<NumBadge n={1} />}>Plan the shape</Pill>
            <Pill icon={<NumBadge n={2} />}>Resolve operations</Pill>
          </div>
        </>
      );
    case 3:
      return (
        <p className="gvf-body">
          When a step rests on a real ambiguity — you have several Slack channels and it must pick one — V2 pins a
          clarifying question to that exact node instead of guessing.{" "}
          <span className="font-medium text-white/90">
            The workflow still finishes and saves either way, and answering is free.
          </span>
        </p>
      );
    case 4:
      return (
        <>
          <p className="gvf-body">
            Edits are patch-based, not full regenerations — so changes animate on the canvas. Never a silent swap.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
              <span className="h-2 w-2 rounded-full bg-[#34d399] shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Added glows in
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
              <span className="h-2 w-2 rounded-full bg-[#f5b14c] shadow-[0_0_8px_rgba(245,177,76,0.8)]" /> Changed pulses
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
              <span className="h-2 w-2 rounded-full bg-[#f0563f] shadow-[0_0_8px_rgba(240,86,63,0.8)]" /> Removed strikes
            </span>
          </div>
        </>
      );
    case 5:
    default:
      return (
        <>
          <p className="gvf-body">
            Your channel names, labels, and database titles are pseudonymized to placeholders before anything reaches
            the model. It only ever sees placeholders — your real names are substituted back only on your side.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-[#ff7a4d]" /> The next generation of Genesis — coming soon.
          </p>
        </>
      );
  }
}

export function GenesisV2ReleaseModalFilm({ onClose }: { onClose: () => void }) {
  const [reduced] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
  const [index, setIndex] = useState(0);
  // Establishing shot: the camera starts deep in the scene and dollies out to
  // the hero framing just after the card has risen.
  const [booting, setBooting] = useState<boolean>(!reduced);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Focus: move into the dialog on open, restore to the opener on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setBooting(false), 260);
    return () => clearTimeout(t);
  }, [reduced]);

  const last = BEATS.length - 1;
  const beat = BEATS[index]!;

  const go = useCallback(
    (target: number) => setIndex(() => Math.max(0, Math.min(last, target))),
    [last]
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Tab") {
        // Minimal focus trap: keep Tab/Shift+Tab cycling inside the dialog.
        const root = rootRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const lastEl = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && (active === lastEl || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const activeCam = booting ? WARP : reduced ? HERO : beat.cam;

  return (
    <div ref={rootRef} className="gvf-root" role="dialog" aria-modal="true" aria-label="What's new in Genesis V2">
      <div className="gvf-backdrop" onClick={onClose} />

      {/* ── Environment: the landing backdrop recreated over the app ── */}
      <div className="gvf-env" aria-hidden="true">
        <div className="gvf-env-grid" />
        <DriftField animate={!reduced} className="gvf-env-field" />
        <div className="gvf-env-glow gvf-env-glow-a" />
        <div className="gvf-env-glow gvf-env-glow-b" />
        <div className="gvf-env-vignette" />
      </div>

      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn("gvf-modal", !reduced && "gvf-modal--in")}
      >
        {/* Beat progress — the landing's scroll-progress gradient */}
        <div className="gvf-progress" aria-hidden="true">
          <div
            className="gvf-progress-bar"
            style={{ transform: `scaleX(${(index + 1) / BEATS.length})` }}
          />
        </div>

        {/* ── Cinematic stage ── */}
        <div className="gvf-stage">
          <div className="gvf-stage-grid" aria-hidden="true" />
          <SignalRibbon animate={!reduced} className="gvf-ribbon" />

          <div className="gvf-camera" style={{ transform: camStr(activeCam) }}>
            {/* Mid plane: connection edges (cyan → brand gradient, cyan flow) */}
            <svg className="gvf-layer gvf-lines" viewBox="0 0 720 380" aria-hidden="true">
              <defs>
                <linearGradient id="gvf-edge-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f05a28" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              {EDGES.map((e, i) => {
                const hidden = e.ghost && index !== 4;
                return (
                  <g key={i} className={cn("gvf-edge", hidden && "gvf-edge-hidden")}>
                    <path className="gvf-edge-base" d={e.d} />
                    <path className="gvf-edge-glow" d={e.d} style={{ animationDelay: `${i * 0.32}s` }} />
                  </g>
                );
              })}
            </svg>

            {/* Mid plane: node cards (landing SystemGraph style) */}
            <div className="gvf-layer gvf-nodes">
              {NODES.map((n) => {
                const Icon = n.icon;
                let stateClass = "";
                if (index === 4) {
                  if (n.id === "trigger") stateClass = "gvf-changed";
                  else if (n.id === "notion") stateClass = "gvf-added";
                  else if (n.id === "oldfilter") stateClass = "gvf-removed gvf-show";
                  else stateClass = "gvf-dim";
                } else if (n.ghost) {
                  stateClass = "gvf-ghost";
                } else if (beat.focus && beat.focus !== n.id) {
                  stateClass = "gvf-dim";
                } else if (beat.focus === n.id) {
                  stateClass = "gvf-focus";
                }
                const scanning = index === 1 && n.id === "gmail";
                const asked = index === 3 && n.id === "slack";
                return (
                  <div
                    key={n.id}
                    className={cn("gvf-node", stateClass, scanning && "gvf-scanning")}
                    style={{ left: `${n.x}px`, top: `${n.y}px`, transform: `translate(-50%, -50%) translateZ(${n.z}px)` }}
                  >
                    <div className="gvf-card">
                      <span className="gvf-ico">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold leading-tight text-white">
                          {n.label}
                        </span>
                        <span className="block truncate font-mono text-[9px] text-white/40">{n.sub}</span>
                      </span>
                      <span className="gvf-status" />
                      {n.id === "oldfilter" && <span className="gvf-strike" />}
                    </div>

                    {asked && (
                      <div className="gvf-pin">
                        <HelpCircle className="gvf-pin-ico" />
                        <span>Which channel? #revenue or #wins?</span>
                      </div>
                    )}

                    {scanning &&
                      CHIPS.map((c, i) => (
                        <span
                          key={c}
                          className="gvf-chip"
                          style={{
                            top: `${CHIP_POS[i]!.top}px`,
                            left: `${CHIP_POS[i]!.left}px`,
                            animationDelay: `${0.15 + i * 0.16}s`,
                          }}
                        >
                          {c}
                        </span>
                      ))}
                  </div>
                );
              })}
            </div>

            {/* Near plane: foreground light particles */}
            <div className="gvf-layer gvf-near">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="gvf-particle"
                  style={{
                    left: `${8 + i * 15}%`,
                    top: `${(i % 3) * 30 + 12}%`,
                    animationDelay: `${i * 0.7}s`,
                    animationDuration: `${5 + (i % 3)}s`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Depth scrims for legibility (screen space, above the world) */}
          <div className="gvf-scrim" />

          {/* Top HUD row */}
          <div className="gvf-topbar">
            <span className="gvf-badge">
              <Sparkles className="h-3 w-3" /> New in Genesis
            </span>
            <button type="button" className="gvf-skip" onClick={onClose} aria-label="Skip announcement">
              Skip
            </button>
          </div>
        </div>

        {/* ── Copy panel (cross-fades per beat) ── */}
        <div className="gvf-panel">
          <div key={index} className="gvf-hud">
            <p className={cn("font-mono text-[10px] font-medium uppercase tracking-[0.28em]", TONE_TEXT[beat.tone])}>
              {beat.kicker}
            </p>
            <h2 className="mt-1.5 text-[1.35rem] font-semibold leading-tight tracking-tight sm:text-2xl">
              <TitleWords title={beat.title} />
            </h2>
            <div className="mt-2">
              <BeatBody index={index} />
            </div>
          </div>
        </div>

        {/* ── Footer controls ── */}
        <div className="gvf-footer">
          <div className="flex items-center gap-1.5">
            {BEATS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to beat ${i + 1}: ${b.kicker}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn("gvf-dot", i === index && "gvf-dot--active")}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" className="gvf-btn-ghost" onClick={prev}>
                Back
              </button>
            )}
            {index < last ? (
              <button type="button" className="gvf-btn-primary" onClick={next}>
                Next
              </button>
            ) : (
              <button type="button" className="gvf-btn-primary" onClick={onClose}>
                Got it, let&apos;s go <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Film grain above everything — the last touch of the product-film look */}
      <div className="gvf-grain" aria-hidden="true" />
    </div>
  );
}
