"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TIERS = [
  { value: "free",      label: "Free" },
  { value: "plus",      label: "Solo" },
  { value: "pro",       label: "Team" },
  { value: "builder",   label: "Scale" },
  { value: "unlimited", label: "∞" },
] as const;

export function PlanPreviewToggle({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(tier: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tier === "unlimited") {
      params.delete("preview_tier");
    } else {
      params.set("preview_tier", tier);
    }
    const qs = params.toString();
    router.replace(`/credits${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60 shrink-0">
        Dev preview
      </span>
      <div className="flex items-center gap-0.5">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => select(t.value)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              current === t.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
