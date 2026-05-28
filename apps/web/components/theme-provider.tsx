"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type BaseTheme = "dark" | "light";
export type AccentColor = "orange" | "blue" | "indigo" | "green" | "pink" | "cyan";
export type BgStyle = "default" | "noir" | "liquid" | "obsidian";

const BASE_THEMES: BaseTheme[] = ["dark", "light"];
const ACCENT_COLORS: AccentColor[] = ["orange", "blue", "indigo", "green", "pink", "cyan"];
const BG_STYLES: BgStyle[] = ["default", "noir", "liquid", "obsidian"];
const FORCED_ORANGE_THEME_ATTRIBUTE = "data-corelyx-forced-orange-theme";
const FORCED_ORANGE_PATHS = new Set(["/", "/login", "/signup", "/forgot-password", "/update-password"]);

interface ThemeContextValue {
  base: BaseTheme;
  accent: AccentColor;
  bgStyle: BgStyle;
  setBase: (b: BaseTheme) => void;
  setAccent: (a: AccentColor) => void;
  setBgStyle: (s: BgStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  base: "light",
  accent: "blue",
  bgStyle: "default",
  setBase: () => {},
  setAccent: () => {},
  setBgStyle: () => {},
});

function isForcedOrangePath(pathname: string | null) {
  const normalizedPathname = pathname?.replace(/\/$/, "") || "/";
  return FORCED_ORANGE_PATHS.has(normalizedPathname);
}

function readStoredTheme() {
  try {
    const storedBase = localStorage.getItem("corelyx-base") as BaseTheme | null;
    const storedAccent = localStorage.getItem("corelyx-accent") as AccentColor | null;
    const storedBg = localStorage.getItem("corelyx-bg") as BgStyle | null;

    return {
      base: storedBase && BASE_THEMES.includes(storedBase) ? storedBase : "light",
      accent: storedAccent && ACCENT_COLORS.includes(storedAccent) ? storedAccent : "blue",
      bgStyle: storedBg && BG_STYLES.includes(storedBg) ? storedBg : "default",
    };
  } catch {
    return { base: "light" as const, accent: "blue" as const, bgStyle: "default" as const };
  }
}

function applyTheme(base: BaseTheme, accent: AccentColor, bgStyle: BgStyle, forceOrangeTheme: boolean) {
  const el = document.documentElement;
  // Non-default styles always use dark mode
  const effectiveBase = forceOrangeTheme ? "light" : base;
  const effectiveAccent = forceOrangeTheme ? "orange" : accent;

  if (forceOrangeTheme) {
    el.setAttribute(FORCED_ORANGE_THEME_ATTRIBUTE, "true");
  } else {
    el.removeAttribute(FORCED_ORANGE_THEME_ATTRIBUTE);
  }
  el.classList.remove(
    ...BASE_THEMES,
    ...ACCENT_COLORS.map((a) => `accent-${a}`),
    ...BG_STYLES.map((s) => `bg-${s}`),
  );
  el.classList.add(effectiveBase, `accent-${effectiveAccent}`, `bg-${bgStyle}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [base, setBaseState] = useState<BaseTheme>("light");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [bgStyle, setBgStyleState] = useState<BgStyle>("default");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const forceOrangeTheme = isForcedOrangePath(pathname);

  useEffect(() => {
    const storedTheme = readStoredTheme();
    setBaseState(storedTheme.base);
    setAccentState(storedTheme.accent);
    setBgStyleState(storedTheme.bgStyle);
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    applyTheme(base, accent, bgStyle, forceOrangeTheme);
  }, [base, accent, bgStyle, forceOrangeTheme, themeLoaded]);

  function setBase(b: BaseTheme) {
    setBaseState(b);
    try { localStorage.setItem("corelyx-base", b); } catch {}
  }

  function setAccent(a: AccentColor) {
    setAccentState(a);
    try { localStorage.setItem("corelyx-accent", a); } catch {}
  }

  function setBgStyle(s: BgStyle) {
    setBgStyleState(s);
    try { localStorage.setItem("corelyx-bg", s); } catch {}
  }

  return (
    <ThemeContext.Provider value={{ base, accent, bgStyle, setBase, setAccent, setBgStyle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
