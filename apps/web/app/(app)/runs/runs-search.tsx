"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";

const DATE_PRESETS = [
  { label: "Today",  value: "today" },
  { label: "7d",     value: "7d" },
  { label: "30d",    value: "30d" },
  { label: "All",    value: "" },
] as const;

interface Props {
  currentQ: string;
  currentSince: string;
}

export function RunsSearch({ currentQ, currentSince }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const buildHref = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [pathname, searchParams]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      startTransition(() => {
        router.replace(buildHref({ q, since: currentSince }), { scroll: false });
      });
    },
    [buildHref, currentSince, router]
  );

  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = "";
    startTransition(() => {
      router.replace(buildHref({ q: "", since: currentSince }), { scroll: false });
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Search box */}
      <div className="relative flex-1 max-w-xs">
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          defaultValue={currentQ}
          onChange={handleInput}
          placeholder="Search program or error…"
          className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {currentQ && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Date presets */}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shrink-0">
        {DATE_PRESETS.map(({ label, value }) => (
          <a
            key={label}
            href={buildHref({ since: value, q: currentQ })}
            onClick={(e) => {
              e.preventDefault();
              startTransition(() => {
                router.replace(buildHref({ since: value, q: currentQ }), { scroll: false });
              });
            }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              currentSince === value
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
