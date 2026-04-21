"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type BaseTheme = "dark" | "light";
export type AccentColor = "orange" | "blue" | "indigo" | "green" | "pink" | "cyan";

const BASE_THEMES: BaseTheme[] = ["dark", "light"];
const ACCENT_COLORS: AccentColor[] = ["orange", "blue", "indigo", "green", "pink", "cyan"];

interface ThemeContextValue {
  base: BaseTheme;
  accent: AccentColor;
  setBase: (b: BaseTheme) => void;
  setAccent: (a: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  base: "dark",
  accent: "orange",
  setBase: () => {},
  setAccent: () => {},
});

function applyTheme(base: BaseTheme, accent: AccentColor) {
  const el = document.documentElement;
  el.classList.remove(...BASE_THEMES, ...ACCENT_COLORS.map((a) => `accent-${a}`));
  el.classList.add(base, `accent-${accent}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [base, setBaseState] = useState<BaseTheme>("dark");
  const [accent, setAccentState] = useState<AccentColor>("orange");

  useEffect(() => {
    try {
      const storedBase = localStorage.getItem("nexflow-base") as BaseTheme | null;
      const storedAccent = localStorage.getItem("nexflow-accent") as AccentColor | null;
      const b = storedBase && BASE_THEMES.includes(storedBase) ? storedBase : "dark";
      const a = storedAccent && ACCENT_COLORS.includes(storedAccent) ? storedAccent : "orange";
      setBaseState(b);
      setAccentState(a);
      applyTheme(b, a);
    } catch {}
  }, []);

  function setBase(b: BaseTheme) {
    setBaseState(b);
    applyTheme(b, accent);
    try { localStorage.setItem("nexflow-base", b); } catch {}
  }

  function setAccent(a: AccentColor) {
    setAccentState(a);
    applyTheme(base, a);
    try { localStorage.setItem("nexflow-accent", a); } catch {}
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
