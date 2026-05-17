import Link from "next/link";
import { Home } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      {/* Glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/6 blur-3xl" />

      <p className="select-none bg-gradient-to-b from-foreground/80 to-foreground/10 bg-clip-text text-8xl font-black leading-none tracking-tighter text-transparent sm:text-9xl">
        404
      </p>

      <div className="mt-4 space-y-1.5">
        <h1 className="text-xl font-black tracking-tight">Page not found</h1>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          This page doesn&apos;t exist or you may not have access to it.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Home className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <BackButton />
      </div>
    </div>
  );
}
