import { cn } from "@/lib/utils";

/* Shared "cinematic" page primitives — the landing-film design language used
   across app pages (dashboard, agents, governance, settings, …). Keep these
   in sync with the landing's scene kit: mono uppercase eyebrows, glowing
   status dots, gradient titles. The ambient backdrop lives in
   components/app-ambient.tsx and is mounted once in the (app) layout. */

/** Gradient page-title classes. Size is left to the caller (text-2xl/3xl…). */
export const CINE_TITLE =
  "bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text font-black tracking-tight text-transparent";

/** Mono uppercase eyebrow with a pulsing glow dot — the film-scene page label. */
export function CineEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-primary",
        className
      )}
    >
      <span className="cx-blink h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.9)]" />
      {children}
    </p>
  );
}
