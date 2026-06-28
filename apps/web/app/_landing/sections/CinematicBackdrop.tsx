"use client";

import React, { useEffect, useRef } from "react";
import { usePrefersReducedMotion, useIsMobile } from "./scene-kit";

/**
 * Fixed environment layer behind every scene: deep vignette + perspective grid
 * + a slow drift of faint depth particles. Ties the scenes into one continuous
 * space. Particles freeze under reduced motion and thin out on mobile.
 */
export function CinematicBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = mobile ? 26 : 70;
    type P = { x: number; y: number; z: number; vy: number; r: number };
    let parts: P[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        vy: -(0.05 + Math.random() * 0.25),
        r: 0.5 + Math.random() * 1.6,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y += p.vy;
        if (p.y < -5) {
          p.y = h + 5;
          p.x = Math.random() * w;
        }
        ctx.globalAlpha = 0.1 + p.z * 0.3;
        ctx.fillStyle = p.z > 0.6 ? "#56b8ff" : "#7c8aa6";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + p.z), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduced) draw();
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced, mobile]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      {/* base wash */}
      <div className="absolute inset-0 bg-[#05060a]" />
      {/* perspective grid, faded toward the horizon */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(120,160,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,160,255,0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 80%)",
        }}
      />
      {/* drifting depth particles */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* corner glows — radial gradients (cheaper than large blur filters) */}
      <div
        className="absolute -left-40 top-1/4 h-[640px] w-[640px]"
        style={{ background: "radial-gradient(circle, rgba(27,58,107,0.22) 0%, transparent 60%)" }}
      />
      <div
        className="absolute -right-40 top-2/3 h-[640px] w-[640px]"
        style={{ background: "radial-gradient(circle, rgba(240,90,40,0.12) 0%, transparent 60%)" }}
      />
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.6)_100%)]" />
    </div>
  );
}
