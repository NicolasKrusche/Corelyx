"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

type PanelResizeEdge = "left" | "right" | "top";

interface PanelResizeHandleProps {
  edge: PanelResizeEdge;
}

interface ResizeStart {
  panel: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Saved so we can restore it after the drag ends. */
  savedTransition: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function PanelResizeHandle({ edge }: PanelResizeHandleProps) {
  const startRef = useRef<ResizeStart | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const panel = event.currentTarget.parentElement;
    if (!panel) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = panel.getBoundingClientRect();
    // Suppress the panel's CSS height/width transition while dragging so every
    // style mutation is applied instantly instead of being animated.
    const savedTransition = panel.style.transition;
    panel.style.transition = "none";
    startRef.current = {
      panel,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      savedTransition,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start) return;

    if (edge === "top") {
      const maxHeight = Math.max(240, Math.floor(window.innerHeight * 0.85));
      start.panel.style.height = `${clamp(start.height - (event.clientY - start.y), 180, maxHeight)}px`;
      return;
    }

    const delta = event.clientX - start.x;
    const nextWidth = edge === "right" ? start.width + delta : start.width - delta;
    start.panel.style.width = `${clamp(nextWidth, 220, 720)}px`;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (startRef.current) {
      // Restore the transition that was suppressed during drag.
      startRef.current.panel.style.transition = startRef.current.savedTransition;
      startRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation={edge === "top" ? "horizontal" : "vertical"}
      aria-label="Resize panel"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "absolute z-50 touch-none transition-colors hover:bg-primary/35 active:bg-primary/50",
        edge === "left" && "left-0 top-0 h-full w-1.5 cursor-col-resize",
        edge === "right" && "right-0 top-0 h-full w-1.5 cursor-col-resize",
        edge === "top" && "left-0 top-0 h-1.5 w-full cursor-row-resize",
      )}
    />
  );
}
