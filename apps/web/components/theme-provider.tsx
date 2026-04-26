"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type BaseTheme = "dark" | "light";
export type AccentColor = "orange" | "blue" | "indigo" | "green" | "pink" | "cyan";

const BASE_THEMES: BaseTheme[] = ["dark", "light"];
const ACCENT_COLORS: AccentColor[] = ["orange", "blue", "indigo", "green", "pink", "cyan"];
const FORCED_ORANGE_THEME_ATTRIBUTE = "data-corelyx-forced-orange-theme";

interface ThemeContextValue {
  base: BaseTheme;
  accent: AccentColor;
  setBase: (b: BaseTheme) => void;
  setAccent: (a: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  base: "light",
  accent: "blue",
  setBase: () => {},
  setAccent: () => {},
});

function applyTheme(base: BaseTheme, accent: AccentColor) {
  const el = document.documentElement;
  const forcedOrangeTheme = el.getAttribute(FORCED_ORANGE_THEME_ATTRIBUTE) === "true";
  const nextBase = forcedOrangeTheme ? "light" : base;
  const nextAccent = forcedOrangeTheme ? "orange" : accent;

  el.classList.remove(...BASE_THEMES, ...ACCENT_COLORS.map((a) => `accent-${a}`));
  el.classList.add(nextBase, `accent-${nextAccent}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [base, setBaseState] = useState<BaseTheme>("light");
  const [accent, setAccentState] = useState<AccentColor>("blue");

  useEffect(() => {
    try {
      const storedBase = localStorage.getItem("corelyx-base") as BaseTheme | null;
      const storedAccent = localStorage.getItem("corelyx-accent") as AccentColor | null;
      const b = storedBase && BASE_THEMES.includes(storedBase) ? storedBase : "light";
      const a = storedAccent && ACCENT_COLORS.includes(storedAccent) ? storedAccent : "blue";
      setBaseState(b);
      setAccentState(a);
      applyTheme(b, a);
    } catch {}
  }, []);

  function setBase(b: BaseTheme) {
    setBaseState(b);
    applyTheme(b, accent);
    try { localStorage.setItem("corelyx-base", b); } catch {}
  }

  function setAccent(a: AccentColor) {
    setAccentState(a);
    applyTheme(base, a);
    try { localStorage.setItem("corelyx-accent", a); } catch {}
  }

  return (
    <ThemeContext.Provider value={{ base, accent, setBase, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
