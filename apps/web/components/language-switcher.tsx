"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "corelyx-language";
const AUTO_KEY = "corelyx-language-auto";
const PROMPT_DISMISSED_KEY = "corelyx-language-prompt-dismissed";

export const SUPPORTED_LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "fr", label: "French", native: "Français" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "nl", label: "Dutch", native: "Nederlands" },
  { code: "pl", label: "Polish", native: "Polski" },
  { code: "sv", label: "Swedish", native: "Svenska" },
  { code: "da", label: "Danish", native: "Dansk" },
  { code: "fi", label: "Finnish", native: "Suomi" },
  { code: "cs", label: "Czech", native: "Čeština" },
  { code: "el", label: "Greek", native: "Ελληνικά" },
  { code: "hu", label: "Hungarian", native: "Magyar" },
  { code: "ro", label: "Romanian", native: "Română" },
  { code: "bg", label: "Bulgarian", native: "Български" },
  { code: "sk", label: "Slovak", native: "Slovenčina" },
  { code: "sl", label: "Slovenian", native: "Slovenščina" },
  { code: "et", label: "Estonian", native: "Eesti" },
  { code: "lt", label: "Lithuanian", native: "Lietuvių" },
  { code: "lv", label: "Latvian", native: "Latviešu" },
  { code: "nb", label: "Norwegian", native: "Norsk" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "zh-CN", label: "Chinese (Simplified)", native: "中文" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "uk", label: "Ukrainian", native: "Українська" },
  { code: "ru", label: "Russian", native: "Русский" },
];

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

function detectSystemLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const raw of candidates) {
    if (!raw) continue;
    if (SUPPORTED_CODES.has(raw)) return raw;
    const short = raw.split("-")[0];
    if (SUPPORTED_CODES.has(short)) return short;
  }
  return "en";
}

// ─── Cookie helper ───────────────────────────────────────────────────────────

const LOCALE_COOKIE = "corelyx-locale";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

function setLocaleCookie(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function getLocaleCookie(): string {
  if (typeof document === "undefined") return "en";
  const entry = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  return entry ? decodeURIComponent(entry.split("=")[1]) : "en";
}

declare global {
  interface Window {
    __corelyxLangBootstrapped?: boolean;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function applyLanguage(code: string) {
  if (typeof window === "undefined") return;
  const target = SUPPORTED_CODES.has(code) ? code : "en";
  localStorage.setItem(STORAGE_KEY, target);
  setLocaleCookie(target);
  window.location.reload();
}

export function LanguageBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__corelyxLangBootstrapped) return;
    window.__corelyxLangBootstrapped = true;

    let stored = localStorage.getItem(STORAGE_KEY);
    const auto = localStorage.getItem(AUTO_KEY) === "true";

    if (!stored && auto) {
      const detected = detectSystemLanguage();
      if (detected !== "en") {
        stored = detected;
        localStorage.setItem(STORAGE_KEY, detected);
      }
    }

    const target = stored && SUPPORTED_CODES.has(stored) ? stored : "en";
    const currentCookie = getLocaleCookie();

    if (currentCookie !== target) {
      // Cookie is out of sync with stored preference — set it and reload so SSR
      // can serve the correct next-intl messages for this locale.
      setLocaleCookie(target);
      if (target !== "en") {
        // Only force a reload for non-English (English is the SSR default).
        window.location.reload();
        return;
      }
    }

    if (target !== "en") {
      document.documentElement.setAttribute("lang", target);
    }
  }, []);

  return null;
}

export function LanguagePrompt() {
  const [visible, setVisible] = useState(false);
  const [detected, setDetected] = useState<string>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const dismissed = localStorage.getItem(PROMPT_DISMISSED_KEY);
    if (stored || dismissed) return;
    const code = detectSystemLanguage();
    if (code === "en") return;
    setDetected(code);
    setVisible(true);
  }, []);

  if (!visible) return null;
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === detected);
  const label = lang?.native ?? detected;

  return (
    <div className="notranslate fixed bottom-4 right-4 z-[60] max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
      <p className="text-sm font-medium text-foreground">
        Translate this site to {label}?
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        The interface will reload in {label}. You can change this anytime in Settings → Language.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(AUTO_KEY, "true");
            applyLanguage(detected);
          }}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Translate
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
            setVisible(false);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          Keep English
        </button>
      </div>
    </div>
  );
}

type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const [current, setCurrent] = useState<string>("en");
  const [auto, setAuto] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrent(localStorage.getItem(STORAGE_KEY) ?? "en");
    setAuto(localStorage.getItem(AUTO_KEY) === "true");
  }, []);

  function handleChange(code: string) {
    setCurrent(code);
    applyLanguage(code);
  }

  function handleAutoToggle(next: boolean) {
    setAuto(next);
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTO_KEY, next ? "true" : "false");
    if (next) {
      const detected = detectSystemLanguage();
      handleChange(detected);
    }
  }

  return (
    <div className={cn("notranslate space-y-4", className)}>
      <div>
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="language-select">
          Display language
        </label>
        <select
          id="language-select"
          value={current}
          onChange={(e) => handleChange(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.native} ({lang.label})
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Changing the language reloads the interface. Legal documents are always authoritative in English.
        </p>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => handleAutoToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Auto-translate to my system language
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Detect the language of your device on first visit and translate automatically.
          </span>
        </span>
      </label>
    </div>
  );
}
