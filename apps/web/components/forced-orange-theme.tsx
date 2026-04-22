"use client";

import { useEffect } from "react";

const ACCENT_CLASSES = ["accent-orange", "accent-blue", "accent-indigo", "accent-green", "accent-pink", "accent-cyan"];
const BASE_CLASSES = ["dark", "light"];
const FORCED_ORANGE_THEME_ATTRIBUTE = "data-nexflow-forced-orange-theme";

function applyForcedOrangeTheme(el: HTMLElement) {
  el.setAttribute(FORCED_ORANGE_THEME_ATTRIBUTE, "true");
  el.classList.remove(...ACCENT_CLASSES, ...BASE_CLASSES);
  el.classList.add("light", "accent-orange");
}

export function ForcedOrangeTheme() {
  useEffect(() => {
    const el = document.documentElement;
    applyForcedOrangeTheme(el);

    return () => {
      let nextBase = "light";
      let nextAccent = "accent-blue";

      try {
        const savedBase = localStorage.getItem("nexflow-base");
        const savedAccent = localStorage.getItem("nexflow-accent");

        nextBase = savedBase === "dark" ? "dark" : "light";
        nextAccent = ACCENT_CLASSES.find((c) => c === `accent-${savedAccent}`) ?? "accent-blue";
      } catch {}

      el.removeAttribute(FORCED_ORANGE_THEME_ATTRIBUTE);
      el.classList.remove(...ACCENT_CLASSES, ...BASE_CLASSES);
      el.classList.add(nextBase, nextAccent);
    };
  }, []);

  return null;
}
