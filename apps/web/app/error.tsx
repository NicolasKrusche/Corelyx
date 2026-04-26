"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">Error</p>
        <h1 className="text-3xl font-black tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-muted-foreground/40">{error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_28px_hsl(var(--primary)/0.45)] transition-all"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent transition-colors"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
