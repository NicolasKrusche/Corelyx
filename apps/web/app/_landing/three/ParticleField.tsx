"use client";

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { buildTargets, type Formation } from "./particle-targets";
import { pointer, sceneProgress, storyPosition } from "./scroll-state";

/* The single continuous particle system behind the whole page. It morphs
   between formations as the scroll story advances:

   signal → chaos → graph → field → vault → field → orbit → field → calm

   Blending runs on the CPU (a few thousand particles is cheap) so each
   formation can carry its own idle motion — the ribbon flows, the chaos
   cloud jitters, the vault and orbit rings revolve. */

const SEGMENTS: { from: Formation; to: Formation; a: number; b: number }[] = [
  { from: "signal", to: "chaos", a: 0.45, b: 0.95 },
  { from: "chaos", to: "graph", a: 1.95, b: 2.55 },
  { from: "graph", to: "field", a: 3.1, b: 3.6 },
  { from: "field", to: "vault", a: 4.95, b: 5.4 },
  { from: "vault", to: "field", a: 5.85, b: 6.3 },
  { from: "field", to: "orbit", a: 7.95, b: 8.35 },
  { from: "orbit", to: "field", a: 8.7, b: 9.15 },
  { from: "field", to: "calm", a: 11.0, b: 11.5 },
];

const FORMATION_OPACITY: Record<Formation, number> = {
  signal: 0.85,
  chaos: 0.7,
  graph: 0.75,
  field: 0.5,
  vault: 0.95,
  orbit: 0.85,
  calm: 0.9,
};

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function blendAt(story: number): { from: Formation; to: Formation; t: number } {
  let current: Formation = SEGMENTS[0].from;
  for (const seg of SEGMENTS) {
    if (story < seg.a) break;
    if (story <= seg.b) {
      return { from: seg.from, to: seg.to, t: smooth((story - seg.a) / (seg.b - seg.a)) };
    }
    current = seg.to;
  }
  return { from: current, to: current, t: 0 };
}

const tmpA: [number, number, number] = [0, 0, 0];
const tmpB: [number, number, number] = [0, 0, 0];

/** Formation-specific idle motion, written into `out`. */
function animate(
  f: Formation,
  x: number,
  y: number,
  z: number,
  s: number,
  time: number,
  out: [number, number, number],
) {
  switch (f) {
    case "signal": {
      const wave =
        Math.sin(x * 0.42 + time * 1.5 + s * 6.283) * 0.55 + Math.sin(x * 0.16 - time * 0.8) * 0.95;
      out[0] = x;
      out[1] = y + wave;
      out[2] = z + Math.cos(x * 0.3 + time + s * 6.283) * 0.45;
      break;
    }
    case "chaos": {
      out[0] = x + Math.sin(time * (0.6 + s * 0.9) + s * 43.0) * 0.5;
      out[1] = y + Math.cos(time * (0.5 + s * 0.7) + s * 29.0) * 0.42;
      out[2] = z + Math.sin(time * 0.7 + s * 97.0) * 0.55;
      break;
    }
    case "field": {
      out[0] = x;
      out[1] = y + Math.sin(time * 0.25 + s * 6.283) * 0.6;
      out[2] = z;
      break;
    }
    case "vault":
    case "orbit": {
      const a = time * (f === "vault" ? 0.22 : 0.16);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      out[0] = x * ca - z * sa;
      out[1] = y;
      out[2] = x * sa + z * ca;
      break;
    }
    default: {
      // graph / calm: settled, barely breathing
      out[0] = x + Math.sin(time * 0.8 + s * 6.283) * 0.05;
      out[1] = y + Math.cos(time * 0.7 + s * 6.283) * 0.05;
      out[2] = z;
    }
  }
}

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (52.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor, a * uOpacity);
  }
`;

export function ParticleField({ count }: { count: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const targets = useMemo(() => buildTargets(count), [count]);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(targets.signal.pos.slice(), 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(targets.signal.col.slice(), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(targets.signal.size.slice(), 1));
    // Everything stays within a bounded stage; skip per-frame bounds work.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uOpacity: { value: 0.85 },
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, [targets]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const story = storyPosition();
    const { from, to, t } = blendAt(story);
    const A = targets[from];
    const B = targets[to];
    const seeds = targets.seed;

    // On wide viewports the vault/orbit scenes place their DOM stage in the
    // right column — shift those formations right so both layers compose.
    // On narrow viewports keep them centred but smaller, behind the stacked UI.
    const wide = state.size.width / state.size.height > 1.15;
    const ringA = from === "vault" || from === "orbit";
    const ringB = to === "vault" || to === "orbit";
    const offA = wide && ringA ? 3.9 : 0;
    const offB = wide && ringB ? 3.9 : 0;
    const sclA = !wide && ringA ? 0.62 : 1;
    const sclB = !wide && ringB ? 0.62 : 1;

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    const size = sizeAttr.array as Float32Array;

    const blending = t > 0 && from !== to;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const s = seeds[i];
      animate(from, A.pos[i3], A.pos[i3 + 1], A.pos[i3 + 2], s, time, tmpA);
      tmpA[0] = tmpA[0] * sclA + offA;
      tmpA[1] *= sclA;
      tmpA[2] *= sclA;
      if (blending) {
        animate(to, B.pos[i3], B.pos[i3 + 1], B.pos[i3 + 2], s, time, tmpB);
        tmpB[0] = tmpB[0] * sclB + offB;
        tmpB[1] *= sclB;
        tmpB[2] *= sclB;
        // stagger the morph per particle so formations dissolve, not slide
        const tt = smooth((t - s * 0.35) / 0.65);
        pos[i3] = tmpA[0] + (tmpB[0] - tmpA[0]) * tt;
        pos[i3 + 1] = tmpA[1] + (tmpB[1] - tmpA[1]) * tt;
        pos[i3 + 2] = tmpA[2] + (tmpB[2] - tmpA[2]) * tt;
        col[i3] = A.col[i3] + (B.col[i3] - A.col[i3]) * tt;
        col[i3 + 1] = A.col[i3 + 1] + (B.col[i3 + 1] - A.col[i3 + 1]) * tt;
        col[i3 + 2] = A.col[i3 + 2] + (B.col[i3 + 2] - A.col[i3 + 2]) * tt;
        size[i] = A.size[i] + (B.size[i] - A.size[i]) * tt;
      } else {
        pos[i3] = tmpA[0];
        pos[i3 + 1] = tmpA[1];
        pos[i3 + 2] = tmpA[2];
        col[i3] = A.col[i3];
        col[i3 + 1] = A.col[i3 + 1];
        col[i3 + 2] = A.col[i3 + 2];
        size[i] = A.size[i];
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    material.uniforms.uOpacity.value =
      FORMATION_OPACITY[from] + (FORMATION_OPACITY[to] - FORMATION_OPACITY[from]) * t;
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();

    // slow environmental rotation + pointer parallax on the whole stage
    const g = groupRef.current;
    if (g) {
      const ry = pointer.x * 0.07 + Math.sin(story * 0.9) * 0.09;
      const rx = -pointer.y * 0.045 + Math.cos(story * 0.7) * 0.03;
      g.rotation.y += (ry - g.rotation.y) * 0.04;
      g.rotation.x += (rx - g.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/** Scroll- and pointer-driven camera: push-in on the hero, settle, dip closer
    at the vault, pull back for the final reveal. */
export function CameraRig() {
  useFrame(({ camera }, dt) => {
    const story = storyPosition();
    const heroP = sceneProgress.hero;
    let z = 15 - smooth(heroP / 0.6) * 2.2 + Math.sin(story * 0.55) * 0.45;
    if (story > 10.8) z += smooth((story - 10.8) / 1.0) * 1.4; // final pull-back
    const tx = pointer.x * 0.9;
    const ty = -pointer.y * 0.55;
    const k = 1 - Math.exp(-3 * dt);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (z - camera.position.z) * k;
    camera.lookAt(0, 0, 0);
  });
  return null;
}
