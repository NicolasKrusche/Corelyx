"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">

      {/* Subtle grid background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Glow blob — red tint for errors */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/8 blur-3xl" />

      <div className="flex flex-col items-center gap-6">
        {/* Big number */}
        <div className="relative select-none">
          <p className="bg-gradient-to-b from-foreground/90 to-foreground/10 bg-clip-text text-[10rem] font-black leading-none tracking-tighter text-transparent sm:text-[14rem]">
            500
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
            {t("unexpectedError")}
          </p>
          <h1 className="text-2xl font-black tracking-tight">
            {t("serverError")}
          </h1>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {t("serverErrorDesc")}
          </p>
        </div>

        {/* Digest for support */}
        {error.digest && (
          <div className="rounded-lg border border-border bg-card px-4 py-2.5">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {t("errorReference")}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {error.digest}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all hover:shadow-[0_0_28px_hsl(var(--primary)/0.45)]"
          >
            {t("tryAgain")}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            {t("goToDashboard")}
          </Link>
        </div>
      </div>

      <p className="absolute bottom-8 text-[11px] font-medium text-muted-foreground/40">
        Corelyx · <span className="font-mono">500</span>
      </p>
    </div>
  );
}
