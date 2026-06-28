"use client";

import React from "react";
import { motion, useScroll, useSpring } from "framer-motion";

/** Thin workflow-progress bar pinned to the top, under the header. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed left-0 top-14 z-[70] h-0.5 w-full origin-left bg-gradient-to-r from-[#f05a28] via-[#ff7a4d] to-[#38bdf8]"
    />
  );
}
