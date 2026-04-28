"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type BaseTheme = "dark" | "light";
export type AccentColor = "orange" | "blue" | "indigo" | "green" | "pink" | "cyan";

const BASE_THEMES: BaseTheme[] = ["dark", "light"];
const ACCENT_COLORS: AccentColor[] = ["orange", "blue", "indigo", "green", "pink", "cyan"];
const FORCED_ORANGE_THEME_ATTRIBUTE = "data-corelyx-forced-orange-theme";
const FORCED_ORANGE_PATHS = new Set(["/", "/login", "/signup", "/forgot-password", "/update-password"]);

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

function isForcedOrangePath(pathname: string | null) {
  const normalizedPathname = pathname?.replace(/\/$/, "") || "/";
  return FORCED_ORANGE_PATHS.has(normalizedPathname);
}

function readStoredTheme() {
  try {
    const storedBase = localStorage.getItem("corelyx-base") as BaseTheme | null;
    const storedAccent = localStorage.getItem("corelyx-accent") as AccentColor | null;

    return {
      base: storedBase && BASE_THEMES.includes(storedBase) ? storedBase : "light",
      accent: storedAccent && ACCENT_COLORS.includes(storedAccent) ? storedAccent : "blue",
    };
  } catch {
    return { base: "light" as const, accent: "blue" as const };
  }
}

function applyTheme(base: BaseTheme, accent: AccentColor, forceOrangeTheme: boolean) {
  const el = document.documentElement;
  const nextBase = forceOrangeTheme ? "light" : base;
  const nextAccent = forceOrangeTheme ? "orange" : accent;

  if (forceOrangeTheme) {
    el.setAttribute(FORCED_ORANGE_THEME_ATTRIBUTE, "true");
  } else {
    el.removeAttribute(FORCED_ORANGE_THEME_ATTRIBUTE);
  }
  el.classList.remove(...BASE_THEMES, ...ACCENT_COLORS.map((a) => `accent-${a}`));
  el.classList.add(nextBase, `accent-${nextAccent}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [base, setBaseState] = useState<BaseTheme>("light");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const forceOrangeTheme = isForcedOrangePath(pathname);

  useEffect(() => {
    const storedTheme = readStoredTheme();
    setBaseState(storedTheme.base);
    setAccentState(storedTheme.accent);
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    applyTheme(base, accent, forceOrangeTheme);
  }, [base, accent, forceOrangeTheme, themeLoaded]);

  function setBase(b: BaseTheme) {
    setBaseState(b);
    try { localStorage.setItem("corelyx-base", b); } catch {}
  }

  function setAccent(a: AccentColor) {
    setAccentState(a);
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
