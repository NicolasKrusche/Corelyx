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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WaterCinematic } from "@/components/genesis/genesis-v2-water";

// ─────────────────────────────────────────────────────────────────────────────
// Genesis V2 release — "Flightdeck" edition.
// A pure-CSS pseudo-3D world (perspective + preserve-3d + translateZ layers).
// A single .gv2-camera rig is transformed per beat; a long CSS transition on
// that transform IS the virtual camera dollying/panning/orbiting the scene.
// No three.js. All geometry is generated; no external assets.
//
// A vanilla-canvas starfield sits behind the CSS world for genuine forward
// depth; it degrades to a single static frame under reduced motion and cleans
// up its rAF/observer on unmount.
// ─────────────────────────────────────────────────────────────────────────────

// Stage-space center the camera frames a focus point onto.
const CX = 320;
const CY = 175;

type Cam = { fx: number; fy: number; s: number; ry: number };

// Warp start (deep in the scene, small + rotated) → resolves to the hero cam.
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
  { id: "trigger", x: 100, y: 180, z: -30, icon: Clock, label: "Weekday 8am", sub: "Schedule" },
  { id: "gmail", x: 270, y: 90, z: 25, icon: Mail, label: "Fetch emails", sub: "Gmail" },
  { id: "notion", x: 270, y: 290, z: -25, icon: NotebookPen, label: "Save to Notion", sub: "Notion" },
  { id: "slack", x: 470, y: 185, z: 35, icon: MessagesSquare, label: "Post summary", sub: "Slack" },
  { id: "report", x: 640, y: 95, z: 0, icon: Send, label: "Send report", sub: "Output" },
  { id: "oldfilter", x: 635, y: 285, z: -15, icon: Filter, label: "Old filter", sub: "Removed", ghost: true },
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

type Beat = { id: string; kicker: string; title: string; cam: Cam; focus: string | null };

const BEATS: Beat[] = [
  { id: "hero", kicker: "The next generation of Genesis", title: "Genesis, reimagined", cam: { fx: 360, fy: 175, s: 0.82, ry: -6 }, focus: null },
  { id: "accounts", kicker: "Knows your accounts", title: "It reads your real accounts, live", cam: { fx: 270, fy: 90, s: 1.16, ry: 9 }, focus: "gmail" },
  { id: "plan", kicker: "Plan, then build", title: "Two phases, reliable on any model", cam: { fx: 360, fy: 175, s: 0.8, ry: 11 }, focus: null },
  { id: "asks", kicker: "Asks instead of guessing", title: "It pins the question to the node", cam: { fx: 470, fy: 185, s: 1.14, ry: -9 }, focus: "slack" },
  { id: "edits", kicker: "Surgical edits you can watch", title: "Every change, animated in place", cam: { fx: 400, fy: 210, s: 0.94, ry: 7 }, focus: null },
  { id: "private", kicker: "Private by design", title: "Grounded in your data, never exposed", cam: { fx: 360, fy: 175, s: 0.95, ry: 0 }, focus: null },
];

const HERO = BEATS[0]!.cam;
const CHIPS = ["Receipts", "Newsletters", "Updates"];
const CHIP_POS: Array<{ top: number; left: number }> = [
  { top: -34, left: 116 },
  { top: 4, left: 128 },
  { top: 42, left: 112 },
];

// ─── Starfield: vanilla canvas, real forward-depth. Reused twice — for the deep
// backdrop behind the modal's CSS world (fast/dense) and for the full-screen
// ambient field around the modal (slower/sparser, masked to the periphery). ────
function Starfield({
  animate,
  count = 150,
  speed = 1.4,
  className = "gv2-starfield",
}: {
  animate: boolean;
  count?: number;
  speed?: number;
  className?: string;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const STAR_COUNT = count;
    type Star = { x: number; y: number; z: number };
    let stars: Star[] = [];

    // Pull the star tint from a CSS var so it stays on-brand in any theme.
    const brand = () => getComputedStyle(canvas).getPropertyValue("--gv2-star").trim() || "165, 195, 255";
    let color = "165,195,255";

    const seed = () => {
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: (Math.random() - 0.5) * (w || 600),
        y: (Math.random() - 0.5) * (h || 300),
        z: Math.random() * (w || 600),
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = brand();
      if (stars.length === 0) seed();
    };

    const draw = (moving: boolean) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      for (const s of stars) {
        if (moving) {
          s.z -= speed;
          if (s.z <= 1) {
            s.x = (Math.random() - 0.5) * w;
            s.y = (Math.random() - 0.5) * h;
            s.z = w;
          }
        }
        const k = 128 / s.z;
        const px = cx + s.x * k;
        const py = cy + s.y * k;
        if (px < 0 || px > w || py < 0 || py > h) continue;
        const size = Math.max(0.3, (1 - s.z / w) * 1.7);
        const alpha = Math.min(1, (1 - s.z / w) * 0.85 + 0.05);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();

    if (!animate) {
      draw(false);
      const ro = new ResizeObserver(() => {
        resize();
        draw(false);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const loop = () => {
      draw(true);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvas, animate, count, speed]);

  return <canvas ref={setCanvas} className={className} aria-hidden="true" />;
}

// Concentric ripple rings for the drop impact, staggered into a ripple train.
const RIPPLE_RINGS = [0, 0.14, 0.3, 0.52, 0.8];

function BeatBody({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <>
          <p className="gv2-body">
            The plan-then-build engine that knows your real accounts, asks before it guesses, and lets you watch every
            edit land on the canvas.
          </p>
          <div className="gv2-pills">
            <span className="gv2-pill"><Radar className="gv2-pill-ico" /> Knows your accounts</span>
            <span className="gv2-pill"><GitBranch className="gv2-pill-ico" /> Plan, then build</span>
            <span className="gv2-pill"><HelpCircle className="gv2-pill-ico" /> Asks first</span>
          </div>
        </>
      );
    case 1:
      return (
        <p className="gv2-body">
          Genesis introspects your connected accounts while it builds — your real Slack channels, Gmail labels, Notion
          databases — and wires each step to actual resources instead of guessing IDs.{" "}
          <span className="gv2-em">Metadata and schema only, never your message contents.</span>
        </p>
      );
    case 2:
      return (
        <>
          <p className="gv2-body">
            V2 generates in two passes: first it plans the whole workflow shape, then it resolves each connector&apos;s
            exact operation per provider. That keeps it reliable even on fast, lightweight models.
          </p>
          <div className="gv2-pills">
            <span className="gv2-pill gv2-pill-num"><span className="gv2-num">1</span> Plan the shape</span>
            <span className="gv2-pill gv2-pill-num"><span className="gv2-num">2</span> Resolve operations</span>
          </div>
        </>
      );
    case 3:
      return (
        <p className="gv2-body">
          When a step rests on a real ambiguity — you have several Slack channels and it must pick one — V2 pins a
          clarifying question to that exact node instead of guessing.{" "}
          <span className="gv2-em">The workflow still finishes and saves either way, and answering is free.</span>
        </p>
      );
    case 4:
      return (
        <>
          <p className="gv2-body">
            Edits are patch-based, not full regenerations — so changes animate on the canvas. Never a silent swap.
          </p>
          <div className="gv2-legend">
            <span className="gv2-lg"><span className="gv2-dot-g gv2-lg-added" /> Added glows in</span>
            <span className="gv2-lg"><span className="gv2-dot-g gv2-lg-changed" /> Changed pulses</span>
            <span className="gv2-lg"><span className="gv2-dot-g gv2-lg-removed" /> Removed strikes</span>
          </div>
        </>
      );
    case 5:
    default:
      return (
        <>
          <p className="gv2-body">
            Your channel names, labels, and database titles are pseudonymized to placeholders before anything reaches
            the model. It only ever sees placeholders — your real names are substituted back only on your side.
          </p>
          <p className="gv2-availability">
            <ShieldCheck className="gv2-avail-ico" /> The next generation of Genesis — coming soon.
          </p>
        </>
      );
  }
}

export function GenesisV2ReleaseModal({ onClose }: { onClose: () => void }) {
  const [reduced] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
  // Full-3D water entrance needs WebGL2 (three r171 dropped WebGL1 — a
  // WebGL1-only browser would pass a loose probe and then render a silent
  // black void). failIfMajorPerformanceCaveat keeps software rasterizers
  // (VMs, RDP, blocklisted GPUs) on the cheap CSS drop→ripple path instead of
  // a seconds-per-frame shader slideshow. State (not a const) so the water
  // component can downgrade us to the CSS path if renderer creation fails
  // AFTER the probe passed (dead discrete GPU, context cap).
  const [webgl, setWebgl] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const c = document.createElement("canvas");
      const ctx = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
      // Release the probe context deterministically — browsers cap live GL
      // contexts (~16) and this one would otherwise linger until GC.
      (ctx as WebGL2RenderingContext | null)?.getExtension?.("WEBGL_lose_context")?.loseContext();
      return !!ctx;
    } catch {
      return false;
    }
  });
  const handleGlFail = useCallback(() => setWebgl(false), []);
  const water = !reduced && webgl;

  const [index, setIndex] = useState(0);
  const [booting, setBooting] = useState<boolean>(!reduced);
  // Entrance choreography: a drop falls, strikes the centre, and the modal
  // rises out of the ripple. `landed` gates impact → ripple → modal-rise;
  // before it, the modal is held below the surface. On the 3D path the water
  // cinematic fires it (~5.6s or Skip intro); on the CSS path a short timer.
  const [landed, setLanded] = useState<boolean>(reduced);
  const [skipTick, setSkipTick] = useState(0);
  const handleRise = useCallback(() => setLanded(true), []);
  const skipIntro = useCallback(() => setSkipTick((s) => s + 1), []);
  // During the water cinematic the card is hidden (visibility:hidden), so
  // dismiss-and-mark-seen actions must not fire from stray input — a skipped
  // intro is recoverable, a consumed once-per-version announcement is not.
  const cinematic = water && !landed;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const skipIntroRef = useRef<HTMLButtonElement | null>(null);

  // Focus: move into the dialog on open, restore to the opener on close.
  // While the card is held underwater (hidden ⇒ unfocusable), the Skip-intro
  // pill is the dialog's only visible control — focus that instead; the
  // `landed` effect below pulls focus onto the card when it surfaces.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (skipIntroRef.current ?? cardRef.current)?.focus();
    return () => prev?.focus?.();
  }, []);

  // When the Skip-intro button unmounts (modal rise), don't strand focus on
  // <body> — pull it back into the dialog.
  useEffect(() => {
    if (!landed) return;
    const active = document.activeElement;
    if (!active || active === document.body || !rootRef.current?.contains(active)) {
      cardRef.current?.focus();
    }
  }, [landed]);

  const last = BEATS.length - 1;
  const beat = BEATS[index]!;

  // CSS-fallback entrance timing. setTimeout (not rAF) so the sequence still
  // fires if the modal mounts while the tab is backgrounded.
  useEffect(() => {
    if (reduced || water) return;
    const tLand = window.setTimeout(() => setLanded(true), 440);
    return () => clearTimeout(tLand);
  }, [reduced, water]);

  // Once the modal starts rising (either path), dolly the stage camera
  // WARP → hero just behind it.
  useEffect(() => {
    if (reduced || !landed) return;
    const t = window.setTimeout(() => setBooting(false), 140);
    return () => clearTimeout(t);
  }, [reduced, landed]);

  const go = useCallback(
    (target: number) => setIndex(() => Math.max(0, Math.min(last, target))),
    [last]
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mid-cinematic: Escape means "get me to the content", not "dismiss the
      // announcement forever"; arrow keys must not mutate beats invisibly.
      if (e.key === "Escape") (cinematic ? skipIntro : onClose)();
      else if (e.key === "ArrowRight") { if (!cinematic) next(); }
      else if (e.key === "ArrowLeft") { if (!cinematic) prev(); }
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
  }, [next, prev, onClose, cinematic, skipIntro]);

  const activeCam = booting ? WARP : reduced ? HERO : beat.cam;

  return (
    <div ref={rootRef} className="gv2-root" role="dialog" aria-modal="true" aria-label="What's new in Genesis V2">
      {/* On the WebGL path the opaque ocean/sky canvas covers the viewport, so
          the backdrop's blur is invisible — skip it (it also trips compositing
          artifacts in software-rendered browsers). The dark fade still runs
          underneath as the base the canvas fades in over. Mid-cinematic a
          click anywhere reads as "get on with it" — skip the intro rather
          than permanently dismissing an announcement nobody has seen yet. */}
      <div
        className={cn("gv2-backdrop", water && "gv2-backdrop--noblur")}
        onClick={cinematic ? skipIntro : onClose}
      />

      {/* ── Rest-of-screen ambient field (behind the modal, over the blur).
          Only on the CSS path: the WebGL scene carries its own sky (dome,
          stars, moon) and its opaque canvas would hide this field anyway —
          skipping it also saves the starfield's rAF loop. ── */}
      {!reduced && !water && (
        <div className="gv2-screen" aria-hidden="true">
          <span className="gv2-neb gv2-neb-a" />
          <span className="gv2-neb gv2-neb-b" />
          <Starfield animate count={90} speed={0.65} className="gv2-screen-field" />
          <span className="gv2-screenvig" />
        </div>
      )}

      {/* ── Arrival, 3D path: a drop falls into real WebGL water; a flying
          camera swoops from top-down across the ripples; the modal rises out
          of the glowing impact point. Keeps running as ambient afterwards. ── */}
      {water && <WaterCinematic skip={skipTick} onRise={handleRise} onFail={handleGlFail} />}
      {water && !landed && (
        <button ref={skipIntroRef} type="button" className="gv2-skipintro" onClick={skipIntro}>
          Skip intro
        </button>
      )}

      {/* ── Arrival, CSS fallback (no WebGL): drop → ripple → modal ── */}
      {!reduced && !water && !landed && (
        <div className="gv2-dropwrap" aria-hidden="true">
          <span className="gv2-drop" />
        </div>
      )}
      {!reduced && !water && landed && (
        <div className="gv2-ripplewrap" aria-hidden="true">
          <span className="gv2-splash" />
          <div className="gv2-surface">
            {RIPPLE_RINGS.map((d, i) => (
              <span key={i} className="gv2-ring" style={{ animationDelay: `${d}s` }} />
            ))}
          </div>
        </div>
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn("gv2-modal", !reduced && (landed ? "gv2-modal--in" : "gv2-modal--pre"))}
      >
        {/* ── Cinematic 3D stage ── */}
        <div className="gv2-stage">
          {/* Deep starfield behind the CSS world */}
          <Starfield animate={!reduced} />

          <div className="gv2-camera" style={{ transform: camStr(activeCam) }}>
            {/* Far plane: nebula + receding grid */}
            <div className="gv2-layer gv2-far">
              <div className="gv2-grid" />
            </div>

            {/* Mid plane: glowing connection lines */}
            <svg className="gv2-layer gv2-lines" viewBox="0 0 720 380" aria-hidden="true">
              <defs>
                <linearGradient id="gv2-flow-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary) / 0)" />
                  <stop offset="50%" stopColor="hsl(var(--primary) / 1)" />
                  <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
                </linearGradient>
              </defs>
              {EDGES.map((e, i) => {
                const hidden = e.ghost && index !== 4;
                return (
                  <g key={i} className={cn("gv2-edge", hidden && "gv2-edge-hidden")}>
                    <path className="gv2-edge-base" d={e.d} />
                    <path className="gv2-edge-glow" d={e.d} style={{ animationDelay: `${i * 0.32}s` }} />
                  </g>
                );
              })}
            </svg>

            {/* Mid plane: node cards */}
            <div className="gv2-layer gv2-nodes">
              {NODES.map((n) => {
                const Icon = n.icon;
                let stateClass = "";
                if (index === 4) {
                  if (n.id === "trigger") stateClass = "gv2-changed";
                  else if (n.id === "notion") stateClass = "gv2-added";
                  else if (n.id === "oldfilter") stateClass = "gv2-removed gv2-show";
                  else stateClass = "gv2-dim";
                } else if (n.ghost) {
                  stateClass = "gv2-ghost";
                } else if (beat.focus && beat.focus !== n.id) {
                  stateClass = "gv2-dim";
                } else if (beat.focus === n.id) {
                  stateClass = "gv2-focus";
                }
                const scanning = index === 1 && n.id === "gmail";
                const asked = index === 3 && n.id === "slack";
                return (
                  <div
                    key={n.id}
                    className={cn("gv2-node", stateClass, scanning && "gv2-scanning")}
                    style={{ left: `${n.x}px`, top: `${n.y}px`, transform: `translate(-50%, -50%) translateZ(${n.z}px)` }}
                  >
                    <div className="gv2-card">
                      <div className="gv2-card-head">
                        <Icon className="gv2-card-ico" />
                        <span className="gv2-card-sub">{n.sub}</span>
                      </div>
                      <div className="gv2-card-label">{n.label}</div>
                      {n.id === "oldfilter" && <span className="gv2-strike" />}
                    </div>

                    {asked && (
                      <div className="gv2-pin">
                        <HelpCircle className="gv2-pin-ico" />
                        <span>Which channel? #revenue or #wins?</span>
                      </div>
                    )}

                    {scanning &&
                      CHIPS.map((c, i) => (
                        <span
                          key={c}
                          className="gv2-chip"
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
            <div className="gv2-layer gv2-near">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="gv2-particle"
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
          <div className="gv2-scrim" />

          {/* Top HUD row */}
          <div className="gv2-topbar">
            <span className="gv2-badge">
              <Sparkles className="gv2-badge-ico" /> New in Genesis
            </span>
            <button type="button" className="gv2-skip" onClick={onClose} aria-label="Skip announcement">
              Skip
            </button>
          </div>
        </div>

        {/* ── Copy panel (cross-fades per beat) ── */}
        <div className="gv2-panel">
          <div key={index} className="gv2-hud">
            <p className="gv2-kicker">{beat.kicker}</p>
            <h2 className="gv2-title">{beat.title}</h2>
            <div className="gv2-body-wrap">
              <BeatBody index={index} />
            </div>
          </div>
        </div>

        {/* ── Footer controls ── */}
        <div className="gv2-footer">
          <div className="gv2-dots">
            {BEATS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to beat ${i + 1}: ${b.kicker}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn("gv2-dot", i === index && "gv2-dot-active")}
              />
            ))}
          </div>
          <div className="gv2-nav">
            {index > 0 && (
              <button type="button" className="gv2-btn" onClick={prev}>
                Back
              </button>
            )}
            {index < last ? (
              <button type="button" className="gv2-btn gv2-btn-primary" onClick={next}>
                Next
              </button>
            ) : (
              <button type="button" className="gv2-btn gv2-btn-primary" onClick={onClose}>
                Got it, let&apos;s go →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
