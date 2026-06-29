"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getFieldHelp, type FieldHelpEntry } from "@/lib/field-help";

export function FieldHelp({
  fieldKey,
  entry,
}: {
  fieldKey?: string;
  entry?: FieldHelpEntry;
}) {
  const help = entry ?? (fieldKey ? getFieldHelp(fieldKey) : null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setPosition(window.innerHeight - rect.bottom < 220 ? "top" : "bottom");
  }, [open]);

  if (!help) return null;

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={`Help: ${help.title}`}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground/40 text-[9px] font-bold text-muted-foreground/70 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary"
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute left-1/2 z-[200] w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-2xl ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <span className="block text-xs font-semibold text-foreground">{help.title}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            {help.description}
          </span>
          {(help.learnMoreUrl || help.externalUrl) && (
            <span className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
              {help.learnMoreUrl && (
                <Link
                  href={help.learnMoreUrl}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Learn more
                </Link>
              )}
              {help.externalUrl && (
                <a
                  href={help.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  {help.externalLabel ?? "External docs"}
                </a>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
