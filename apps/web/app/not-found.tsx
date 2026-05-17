import Link from "next/link";

export default function NotFoundPage() {
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

      {/* Glow blob */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

      {/* Content */}
      <div className="flex flex-col items-center gap-6">
        {/* Big number */}
        <div className="relative select-none">
          <p
            className="bg-gradient-to-b from-foreground/90 to-foreground/10 bg-clip-text text-[10rem] font-black leading-none tracking-tighter text-transparent sm:text-[14rem]"
          >
            404
          </p>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight">
            Page not found
          </h1>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have been
            moved. Double-check the URL or head back to safety.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all hover:shadow-[0_0_28px_hsl(var(--primary)/0.45)]"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Contact support
          </Link>
        </div>
      </div>

      {/* Footer hint */}
      <p className="absolute bottom-8 text-[11px] font-medium text-muted-foreground/40">
        Corelyx · <span className="font-mono">404</span>
      </p>
    </div>
  );
}
