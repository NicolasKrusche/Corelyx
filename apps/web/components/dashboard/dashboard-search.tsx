"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DashboardSearch({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setValue(initialValue);
    }
  }, [initialValue]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParamsString);
      const trimmed = value.trim();
      const current = params.get("q") ?? "";

      if (current === trimmed) return;

      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParamsString, value]);

  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
      <input
        type="search"
        ref={inputRef}
        aria-label="Search dashboard"
        placeholder="Search workflows and recent runs"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-10 w-full rounded-xl border border-border/70 bg-card/60 pl-9 pr-10 text-sm outline-none backdrop-blur-md transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-[0_0_24px_-10px_hsl(var(--primary)/0.6)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
