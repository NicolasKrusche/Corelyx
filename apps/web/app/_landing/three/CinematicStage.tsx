"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useIsMobile, usePrefersReducedMotion } from "../sections/scene-kit";
import { pointer, resetSceneProgress } from "./scroll-state";

const CinematicCanvas = dynamic(() => import("./CinematicCanvas"), { ssr: false });

const WebglContext = createContext(false);

/** True once the WebGL particle stage is live — DOM scenes use this to drop
    their 2D fallback visuals so the two layers don't double up. */
export function useWebglStage() {
  return useContext(WebglContext);
}

function supportsWebgl() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function CinematicStage({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    setWebgl(supportsWebgl());
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      resetSceneProgress();
      pointer.x = 0;
      pointer.y = 0;
    };
  }, []);

  const active = webgl && !reduced;

  return (
    <WebglContext.Provider value={active}>
      {active ? <CinematicCanvas mobile={mobile} /> : null}
      {children}
    </WebglContext.Provider>
  );
}
