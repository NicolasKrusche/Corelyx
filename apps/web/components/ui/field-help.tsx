"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getFieldHelp, type FieldHelpEntry } from "@/lib/field-help";

const TOOLTIP_WIDTH = 256;
const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 12;
const ESTIMATED_TOOLTIP_HEIGHT = 220;
const CLOSE_DELAY_MS = 300;

type TooltipPosition = {
  left: number;
  top: number;
};

export function FieldHelp({
  fieldKey,
  entry,
}: {
  fieldKey?: string;
  entry?: FieldHelpEntry;
}) {
  const help = entry ?? (fieldKey ? getFieldHelp(fieldKey) : null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openTooltip = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const closeTooltipSoon = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const shouldKeepOpen = useCallback((target: EventTarget | null) => {
    const nextTarget = target as Node | null;
    return Boolean(
      nextTarget &&
        (wrapRef.current?.contains(nextTarget) || tooltipRef.current?.contains(nextTarget)),
    );
  }, []);

  const handleMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (shouldKeepOpen(event.relatedTarget)) {
        return;
      }
      closeTooltipSoon();
    },
    [closeTooltipSoon, shouldKeepOpen],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLSpanElement>) => {
      if (shouldKeepOpen(event.relatedTarget)) {
        return;
      }
      closeTooltipSoon();
    },
    [closeTooltipSoon, shouldKeepOpen],
  );

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const height = tooltipRef.current?.offsetHeight ?? ESTIMATED_TOOLTIP_HEIGHT;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placeAbove = spaceBelow < height + TOOLTIP_GAP + VIEWPORT_PADDING && spaceAbove > spaceBelow;
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING);
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING);

    setTooltipPosition({
      left: Math.min(
        Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, VIEWPORT_PADDING),
        maxLeft,
      ),
      top: placeAbove
        ? Math.max(rect.top - height - TOOLTIP_GAP, VIEWPORT_PADDING)
        : Math.min(rect.bottom + TOOLTIP_GAP, maxTop),
    });
  }, []);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!help) return null;

  const tooltip =
    open && mounted && typeof document !== "undefined"
      ? createPortal(
          <span
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            onMouseEnter={openTooltip}
            onMouseLeave={handleMouseLeave}
            onFocus={openTooltip}
            onBlur={handleBlur}
            className="fixed z-[1000] max-h-[min(70vh,24rem)] w-64 overflow-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-2xl"
            style={{
              left: tooltipPosition?.left ?? 0,
              top: tooltipPosition?.top ?? 0,
              visibility: tooltipPosition ? "visible" : "hidden",
            }}
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
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={wrapRef}
      className="inline-flex"
      onMouseEnter={openTooltip}
      onMouseLeave={handleMouseLeave}
      onFocus={openTooltip}
      onBlur={handleBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Help: ${help.title}`}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground/40 text-[9px] font-bold text-muted-foreground/70 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary"
        onClick={(event) => {
          event.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            openTooltip();
          }
        }}
      >
        ?
      </button>
      {tooltip}
    </span>
  );
}
