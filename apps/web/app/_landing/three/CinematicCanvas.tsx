"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
import { CameraRig, ParticleField } from "./ParticleField";

/* Fixed full-viewport WebGL stage. Sits between the 2D backdrop (z-0) and the
   DOM scene content (z-10) so the particle system reads as the environment
   the product UI floats inside. Loaded lazily; never rendered on the server,
   under reduced motion, or when WebGL is unavailable. */

export default function CinematicCanvas({ mobile }: { mobile: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1]">
      <Canvas
        dpr={[1, 1.6]}
        camera={{ fov: 60, position: [0, 0, 15], near: 0.1, far: 80 }}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <ParticleField count={mobile ? 1400 : 4200} />
        <CameraRig />
      </Canvas>
    </div>
  );
}
