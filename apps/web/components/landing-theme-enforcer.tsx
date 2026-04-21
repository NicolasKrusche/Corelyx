"use client";

import { useEffect } from "react";

const ACCENT_CLASSES = ["accent-orange", "accent-blue", "accent-indigo", "accent-green", "accent-pink", "accent-cyan"];
const BASE_CLASSES = ["dark", "light"];

export function LandingThemeEnforcer() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove(...ACCENT_CLASSES, ...BASE_CLASSES);
    el.classList.add("light", "accent-orange");

    return () => {
      try {
        const savedBase = localStorage.getItem("nexflow-base");
        const savedAccent = localStorage.getItem("nexflow-accent");
        el.classList.remove(...ACCENT_CLASSES, ...BASE_CLASSES);
        el.classList.add(
          savedBase === "dark" ? "dark" : "light",
          ACCENT_CLASSES.find((c) => c === `accent-${savedAccent}`) ?? "accent-blue"
        );
      } catch {}
    };
  }, []);

  return null;
}
