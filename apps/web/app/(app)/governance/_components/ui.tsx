import { cn } from "@/lib/utils";

/** Status-tinted pill classes shared by all governance pages. */
export function statusClass(status: string) {
  const s = status.toLowerCase();
  if (/(prohibited|high[ -]?risk|\bmissing\b|rejected|failed|invalid)/.test(s))
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  if (/(completed?|active|approved|minimal risk|limited risk|not required|^required$|valid|success)/.test(s))
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (/(partial|draft|recommended|unknown|review|not marked|pending|waiting)/.test(s))
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-secondary text-muted-foreground";
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

/** Section card with a titled header, used across governance sub-pages. */
export function PanelSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border glass-panel">
      <div className="border-b border-border/50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
