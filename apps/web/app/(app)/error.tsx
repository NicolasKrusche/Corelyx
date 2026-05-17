"use client";

import { useEffect } from "react";
import { RefreshCw, Home } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      {/* Subtle red glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/6 blur-3xl" />

      {/* Icon */}
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-6 w-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-destructive">
          {t("unexpectedError")}
        </p>
        <h1 className="text-xl font-black tracking-tight">
          {t("appError")}
        </h1>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          {t("appErrorDesc")}
        </p>
      </div>

      {/* Digest */}
      {error.digest && (
        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            {t("errorReference")}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("tryAgain")}
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
        >
          <Home className="h-3.5 w-3.5" />
          {t("goToDashboard")}
        </a>
      </div>
    </div>
  );
}
