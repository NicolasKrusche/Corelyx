"use client";

import { useEffect, useRef } from "react";

/**
 * Page-scoped ambient layer echoing the landing film: a perspective grid
 * fading toward the horizon plus a slow drift of faint depth particles and a
 * whisper of film grain. Used by the dashboard and agents pages. Colors are
 * read from the active theme's CSS variables so every base/accent/bg style
 * keeps its own character; everything stays at single-digit opacity, freezes
 * under prefers-reduced-motion, and is hidden entirely in the noir style
 * (see .dash-ambient rules in globals.css).
 */
export function AppAmbient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMq = window.matchMedia("(max-width: 767px)");

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type P = { x: number; y: number; z: number; vy: number; r: number; accent: boolean };
    let parts: P[] = [];

    // Particle tints follow the live theme: --theme-glow-strong is the accent
    // family's bright edge, the neutral matches the landing's depth dust.
    let accentColor = "hsl(210 90% 60%)";
    let neutralColor = "#7c8aa6";
    let alphaScale = 1;

    const readTheme = () => {
      const glow = getComputedStyle(document.documentElement)
        .getPropertyValue("--theme-glow-strong")
        .trim();
      const light = document.documentElement.classList.contains("light");
      accentColor = glow ? `hsl(${glow})` : "hsl(210 90% 60%)";
      neutralColor = light ? "#41506b" : "#7c8aa6";
      alphaScale = light ? 0.5 : 1;
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = mobileMq.matches ? 18 : 46;
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        vy: -(0.04 + Math.random() * 0.2),
        r: 0.5 + Math.random() * 1.5,
        accent: Math.random() > 0.62,
      }));
    };

    // ~30fps is indistinguishable for slow-drifting dust but halves the
    // full-screen composite work this layer adds to every app page.
    const FRAME_MS = 33;
    let lastFrame = 0;

    const draw = (now = 0) => {
      if (!reducedMq.matches && now - lastFrame < FRAME_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y += p.vy;
        if (p.y < -5) {
          p.y = h + 5;
          p.x = Math.random() * w;
        }
        ctx.globalAlpha = (0.05 + p.z * 0.2) * alphaScale;
        ctx.fillStyle = p.accent ? accentColor : neutralColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + p.z), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reducedMq.matches) raf = requestAnimationFrame(draw);
    };

    const restart = () => {
      cancelAnimationFrame(raf);
      if (reducedMq.matches) draw(); // single static frame
      else raf = requestAnimationFrame(draw);
    };

    readTheme();
    resize();
    restart();

    // Theme switches (light/dark, accents, bg styles) swap classes on <html>.
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    window.addEventListener("resize", resize);
    reducedMq.addEventListener("change", restart);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      reducedMq.removeEventListener("change", restart);
    };
  }, []);

  return (
    <div aria-hidden="true" className="dash-ambient pointer-events-none fixed inset-0 -z-[8]">
      <div className="dash-grid absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="dash-grain absolute inset-0" />
    </div>
  );
}
