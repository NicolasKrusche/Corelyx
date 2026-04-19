"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "nexflow-consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage blocked (private browsing etc.) — don't show
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pointer-events-none">
      <div className="mx-auto max-w-2xl pointer-events-auto">
        <div className="relative rounded-2xl border border-white/10 bg-card/90 backdrop-blur-xl px-5 py-4 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Top border glow */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent rounded-t-2xl" />

          <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
            We use cookies strictly for authentication and preferences — no tracking.{" "}
            <Link href="/privacy" className="text-foreground/70 hover:text-primary underline underline-offset-2 transition-colors">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/terms" className="text-foreground/70 hover:text-primary underline underline-offset-2 transition-colors">
              Terms of Service
            </Link>
          </p>

          <button
            onClick={accept}
            className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_0_16px_rgba(249,115,22,0.35)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
