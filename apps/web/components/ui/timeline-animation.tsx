"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

type TimelineContentProps = {
  children: React.ReactNode;
  animationNum?: number;
  timelineRef?: React.RefObject<HTMLElement>;
  customVariants?: Variants;
  className?: string;
  as?: "div" | "p";
};

const defaultVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: "blur(10px)",
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.15,
      duration: 0.5,
      ease: [0.2, 0.65, 0.3, 0.9],
    },
  }),
};

export function TimelineContent({
  children,
  animationNum = 0,
  customVariants,
  className,
  as = "div",
}: TimelineContentProps) {
  const MotionTag = as === "p" ? motion.p : motion.div;

  return (
    <MotionTag
      custom={animationNum}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={customVariants ?? defaultVariants}
      className={cn(className)}
    >
      {children}
    </MotionTag>
  );
}
