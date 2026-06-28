"use client";

import React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Shared design primitives for the Corelyx cinematic landing story.
 *
 * Color language (matches the brief):
 *   orange  #f05a28  — Corelyx system / brand
 *   cyan    #38bdf8  — data + intelligence accents
 *   green   #34d399  — approved / verified / safe
 *   amber   #f5b14c  — human review / pending
 *   red     #f0563f  — blocked / risk / non-compliant
 *
 * Every section is hardcoded dark so the scroll reads as one continuous,
 * cinematic dark canvas regardless of the page theme.
 */
export const PALETTE = {
  brand: "#f05a28",
  brandSoft: "#ff7a4d",
  cyan: "#38bdf8",
  green: "#34d399",
  amber: "#f5b14c",
  red: "#f0563f",
  ink: "#07080a",
  ink2: "#0a0c10",
} as const;

/** Fade-up reveal that respects reduced motion and only animates once in view. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const MotionTag = as === "li" ? motion.li : as === "span" ? motion.span : motion.div;
  return (
    <MotionTag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}

/** Stagger container + item helpers for grids of cards. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

/** Small mono eyebrow label used to open most sections. */
export function Eyebrow({
  icon,
  children,
  tone = "brand",
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "brand" | "cyan" | "amber" | "green" | "muted";
}) {
  const color =
    tone === "cyan"
      ? "text-[#38bdf8]"
      : tone === "amber"
        ? "text-[#f5b14c]"
        : tone === "green"
          ? "text-[#34d399]"
          : tone === "muted"
            ? "text-white/45"
            : "text-[#f05a28]";
  return (
    <p
      className={cn(
        "mb-4 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em]",
        color,
      )}
    >
      {icon}
      {children}
    </p>
  );
}

/** Mono status pill — the "Draft / Review required / Approved / Blocked" vocabulary. */
export function StatusPill({
  state,
  children,
}: {
  state: "approved" | "review" | "blocked" | "running" | "secure" | "neutral";
  children: React.ReactNode;
}) {
  const styles: Record<typeof state, string> = {
    approved: "border-[#34d399]/30 bg-[#34d399]/10 text-[#7ff0c4]",
    review: "border-[#f5b14c]/30 bg-[#f5b14c]/10 text-[#ffd79a]",
    blocked: "border-[#f0563f]/30 bg-[#f0563f]/10 text-[#ffb0a3]",
    running: "border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#a5e3ff]",
    secure: "border-[#f05a28]/30 bg-[#f05a28]/10 text-[#ffb799]",
    neutral: "border-white/15 bg-white/[0.04] text-white/55",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        styles[state],
      )}
    >
      {children}
    </span>
  );
}

/** Section heading + supporting copy block. */
export function SectionHead({
  title,
  intro,
  align = "left",
  className,
}: {
  title: React.ReactNode;
  intro?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {intro ? (
        <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
          {intro}
        </p>
      ) : null}
    </div>
  );
}

/** Standard dark section shell with consistent rhythm + optional glow. */
export function SectionShell({
  id,
  children,
  className,
  glow = "brand",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  glow?: "brand" | "cyan" | "amber" | "none";
}) {
  const glowColor =
    glow === "cyan"
      ? "bg-[#38bdf8]/[0.06]"
      : glow === "amber"
        ? "bg-[#f5b14c]/[0.05]"
        : glow === "none"
          ? "hidden"
          : "bg-[#f05a28]/[0.06]";
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-20 overflow-hidden px-5 py-24 sm:px-8 sm:py-32",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-32 left-1/2 h-[440px] w-[820px] -translate-x-1/2 rounded-full blur-3xl",
          glowColor,
        )}
      />
      <div className="relative mx-auto max-w-6xl">{children}</div>
    </section>
  );
}
