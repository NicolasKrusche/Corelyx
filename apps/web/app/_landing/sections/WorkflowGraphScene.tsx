"use client";

import React from "react";
import { gsap } from "gsap";
import { PinnedScene, SceneLabel, useScene, usePrefersReducedMotion } from "./scene-kit";
import { SystemGraph } from "./SystemGraph";
import { reportSceneProgress } from "../three/scroll-state";

export function WorkflowGraphScene() {
  const reduced = usePrefersReducedMotion();

  const ref = useScene((scope) => {
    const q = gsap.utils.selector(scope);
    const nodes = q(".sg-node");
    const edges = q(".sg-edge");

    gsap.set(nodes, { xPercent: -50, yPercent: -50 });
    gsap.set(edges, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(q(".s3-copy"), { opacity: 0, y: 30 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scope,
        start: "top top",
        end: "+=1600",
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: reportSceneProgress("graph"),
      },
    });

    tl.from(nodes, {
      x: () => gsap.utils.random(-380, 380),
      y: () => gsap.utils.random(-260, 260),
      opacity: 0,
      scale: 0.4,
      ease: "power3.out",
      duration: 1.6,
      stagger: 0.08,
    }, 0)
      .fromTo(q(".sg-stage"), { rotateY: 16, rotateX: 10, scale: 1.12 }, { rotateY: 0, rotateX: 0, scale: 1, ease: "power2.out", duration: 2.4 }, 0)
      .to(edges, { strokeDashoffset: 0, ease: "power1.inOut", duration: 1.6, stagger: 0.12 }, 0.8)
      .to(q(".s3-copy"), { opacity: 1, y: 0, ease: "power3.out", duration: 1 }, 1.2);
  }, { enabled: !reduced });

  return (
    <PinnedScene sceneRef={ref} id="platform" className="text-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        {/* copy */}
        <div className="s3-copy relative order-2 lg:order-1">
          <div
            aria-hidden="true"
            className="absolute -inset-x-16 -inset-y-10 -z-10"
            style={{ background: "radial-gradient(ellipse at center, rgba(5,6,10,0.7) 0%, rgba(5,6,10,0.35) 60%, transparent 80%)" }}
          />
          <SceneLabel tone="cyan" className="mb-5">From chaos to control</SceneLabel>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.6rem]">
            Corelyx turns automation into a governed workflow system.
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-white/55">
            Design the workflow visually, run it with structure, pause sensitive
            actions for approval, protect credentials, and leave evidence behind.
          </p>
        </div>

        {/* graph stage in perspective */}
        <div className="order-1 lg:order-2" style={{ perspective: "1200px" }}>
          <div className="[transform-style:preserve-3d]">
            <SystemGraph variant="governed" className="scale-[0.78] sm:scale-90 lg:scale-100" />
          </div>
        </div>
      </div>
    </PinnedScene>
  );
}
