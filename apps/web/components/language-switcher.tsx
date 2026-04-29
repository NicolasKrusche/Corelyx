"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "corelyx-language";
const AUTO_KEY = "corelyx-language-auto";
const PROMPT_DISMISSED_KEY = "corelyx-language-prompt-dismissed";
const CACHE_PREFIX = "corelyx-tx:";

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

// ─── DOM translator ──────────────────────────────────────────────────────────

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "VAR",
  "TEXTAREA", "INPUT", "SELECT", "OPTION",
]);

function shouldSkipNode(node: Node): boolean {
  let cur: Node | null = node;
  while (cur && cur !== document.body) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as Element;
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.classList?.contains("notranslate")) return true;
      if (el.getAttribute("translate") === "no") return true;
      if (el.getAttribute("contenteditable") === "true") return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

function collectTextNodes(root: Node): Text[] {
  const result: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue ?? "";
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      // Skip pure punctuation/numbers — translation is wasted.
      if (!/[\p{L}]/u.test(text)) return NodeFilter.FILTER_REJECT;
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    result.push(n as Text);
  }
  return result;
}

function cacheKey(lang: string, source: string): string {
  // djb2 hash for compact, deterministic key.
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return `${CACHE_PREFIX}${lang}:${(hash >>> 0).toString(36)}`;
}

function getCached(lang: string, source: string): string | null {
  try {
    return localStorage.getItem(cacheKey(lang, source));
  } catch {
    return null;
  }
}

function setCached(lang: string, source: string, translated: string) {
  try {
    localStorage.setItem(cacheKey(lang, source), translated);
  } catch {
    // Quota exceeded — clear oldest 25% of translation cache and retry once.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      const drop = Math.ceil(keys.length / 4);
      for (let i = 0; i < drop; i++) localStorage.removeItem(keys[i]);
      localStorage.setItem(cacheKey(lang, source), translated);
    } catch {
      // give up silently
    }
  }
}

async function fetchTranslations(texts: string[], target: string): Promise<string[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, target }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Translate API error: ${res.status}`);
  const body = (await res.json()) as { translations?: string[] };
  return body.translations ?? [];
}

let translationInProgress = false;

async function translateRoot(root: Node, target: string) {
  if (target === "en") return;
  if (translationInProgress) return;
  translationInProgress = true;
  try {
    const nodes = collectTextNodes(root);
    if (nodes.length === 0) return;

    type Pending = { node: Text; source: string };
    const pending: Pending[] = [];

    for (const node of nodes) {
      const source = node.nodeValue ?? "";
      const cached = getCached(target, source);
      if (cached !== null) {
        node.nodeValue = cached;
      } else {
        pending.push({ node, source });
      }
    }

    if (pending.length === 0) return;

    // Batch into chunks of 50 nodes / 30K chars.
    const chunks: Pending[][] = [];
    let current: Pending[] = [];
    let currentChars = 0;
    for (const item of pending) {
      const len = item.source.length;
      if (current.length >= 50 || currentChars + len > 30_000) {
        if (current.length > 0) chunks.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(item);
      currentChars += len;
    }
    if (current.length > 0) chunks.push(current);

    for (const chunk of chunks) {
      try {
        const translated = await fetchTranslations(chunk.map((c) => c.source), target);
        for (let i = 0; i < chunk.length; i++) {
          const tx = translated[i];
          if (typeof tx === "string" && tx.length > 0) {
            chunk[i].node.nodeValue = tx;
            setCached(target, chunk[i].source, tx);
          }
        }
      } catch (err) {
        console.warn("[translate] batch failed:", err);
      }
    }
  } finally {
    translationInProgress = false;
  }
}

let mutationObserver: MutationObserver | null = null;
let pendingNodes: Set<Node> = new Set();
let flushHandle: number | null = null;

function startMutationObserver(target: string) {
  if (mutationObserver) mutationObserver.disconnect();
  if (target === "en") return;

  mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
            pendingNodes.add(n);
          }
        });
      } else if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
        pendingNodes.add(m.target);
      }
    }
    if (flushHandle !== null) return;
    flushHandle = window.setTimeout(() => {
      flushHandle = null;
      const nodes = Array.from(pendingNodes);
      pendingNodes = new Set();
      for (const n of nodes) {
        void translateRoot(n, target);
      }
    }, 250);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

declare global {
  interface Window {
    __corelyxLangBootstrapped?: boolean;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function applyLanguage(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, code);
  // Clear cache when switching languages so source text can be re-collected from fresh markup.
  // (We keep per-lang translation cache; only the in-DOM text needs a reload.)
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
        localStorage.setItem(STORAGE_KEY, detected);
        stored = detected;
      }
    }

    if (!stored || stored === "en") return;

    document.documentElement.setAttribute("lang", stored);
    void translateRoot(document.body, stored);
    startMutationObserver(stored);
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
        Translation is provided by DeepL (EU-based, GDPR compliant). You can change this anytime in Settings.
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
          Translation is powered by DeepL — an EU-based, GDPR-compliant service. Quality is high
          for European languages but legal documents are authoritative in English.
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
