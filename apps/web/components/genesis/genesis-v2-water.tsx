"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Genesis V2 announcement — full-3D cinematic water entrance.
//
// Raw three + @react-three/fiber (no drei). A luminous drop falls into a dark
// ocean at night; a dispersive ripple wave-train spreads across a shader-lit
// water surface (fresnel, starlit reflections, specular, subsurface brand
// glow); a crown splash and Worthington jet erupt at impact; and a flying
// camera starts top-down above the water, tracks the drop, then swoops down
// and banks across the surface before settling as the modal rises out of the
// glowing impact point. Afterwards the scene keeps running as a calm ambient
// background (gentle swell + occasional stray ripples) behind the modal.
//
// The ocean must read as INFINITE — no visible mesh rim. Three things work
// together: (1) the water is a radial disc, vertex-dense near the impact and
// exponentially sparser out to r≈650; (2) a procedural night-sky dome
// (gradient, brand nebula, stars, a low moon) surrounds the scene; (3) both
// shaders converge on the exact same horizon-haze color, so by the rim the
// water is indistinguishable from the sky behind it.
//
// The timeline is wall-clock based (performance.now), NOT accumulated frame
// deltas, and the rise callback is ALSO scheduled as a setTimeout — so the
// choreography completes even if rAF is throttled (backgrounded tab).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

export const WATER_TIMELINE = {
  dropStart: 1.05, // drop appears high above the water
  impact: 2.2,     // drop strikes the surface
  rise: 5.6,       // modal begins rising out of the impact point
  settle: 7.0,     // cinematic ends → calm ambient loop
} as const;

// Mutable wall-clock shared between the DOM side (timeout fallbacks, skip)
// and the R3F frame loop. `offset` jumps forward when the intro is skipped.
type WaterClock = { start: number; offset: number };

function clockElapsed(c: WaterClock): number {
  return (performance.now() - c.start) / 1000 + c.offset;
}

// ─── Brand color from the CSS theme (HSL triplet custom property) ────────────
function brandColor(): THREE.Color {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
    if (m) {
      const c = new THREE.Color();
      c.setHSL(Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100, THREE.SRGBColorSpace);
      return c;
    }
  } catch {
    // fall through to default
  }
  return new THREE.Color(0.15, 0.55, 0.96);
}

// ─── Water shader ─────────────────────────────────────────────────────────────
// Height field = ambient swell + a dispersive 3-packet ripple train from the
// impact + an occasional small ambient pulse. Shared by vertex (displacement)
// and fragment (per-pixel finite-difference normals → far more detail than
// the tessellation alone could carry).

const WATER_COMMON = /* glsl */ `
uniform float uTime;
uniform float uImpactTime;
uniform float uCalm;
uniform float uPulseTime;
uniform vec2 uPulsePos;

float ambientH(vec2 p, float t) {
  float h = 0.0;
  h += 0.050 * sin(dot(p, vec2(0.30, 0.16)) + t * 0.50);
  h += 0.040 * sin(dot(p, vec2(-0.19, 0.26)) + t * 0.71 + 1.7);
  h += 0.028 * sin(dot(p, vec2(0.12, -0.29)) + t * 0.93 + 4.1);
  h += 0.016 * sin(dot(p, vec2(0.42, 0.35)) + t * 1.31 + 2.3);
  return h;
}

// Expanding wave packet: gaussian envelope travelling at 'speed', cosine
// carrier, radial attenuation. Dispersive look comes from summing packets
// with different speeds/frequencies.
float ripplePacket(float r, float te, float speed, float k, float width, float amp, float damp) {
  float center = speed * te;
  float x = (r - center) / max(width, 1e-3);
  float env = exp(-x * x);
  float carrier = cos(k * (r - center));
  float atten = exp(-r * damp) / (1.0 + 0.45 * r);
  return amp * env * carrier * atten;
}

float impactH(vec2 p, float t) {
  float te = t - uImpactTime;
  if (te <= 0.0) return 0.0;
  float r = length(p);
  float h = 0.0;
  h += ripplePacket(r, te,        3.10,  5.5, 0.90 + 0.36 * te, 0.42, 0.050);
  h += ripplePacket(r, te - 0.12, 2.35,  7.5, 0.55 + 0.30 * te, 0.30, 0.060);
  h += ripplePacket(r, te - 0.28, 1.70, 10.0, 0.40 + 0.22 * te, 0.20, 0.075);
  // capillary shimmer right after impact
  h += 0.05 * exp(-te * 1.4) * exp(-r * 0.8) * sin(24.0 * r - 26.0 * te);
  // centre rebound oscillation (Worthington)
  h += 0.34 * exp(-te * 2.1) * exp(-r * r * 2.2) * sin(9.0 * te - 3.0 * r);
  return h * exp(-te * 0.16);
}

float pulseH(vec2 p, float t) {
  if (uPulseTime < 0.0) return 0.0;
  float te = t - uPulseTime;
  if (te <= 0.0) return 0.0;
  float r = length(p - uPulsePos);
  return ripplePacket(r, te, 2.2, 8.0, 0.5 + 0.25 * te, 0.06, 0.12) * exp(-te * 0.5);
}

float waterH(vec2 p, float t) {
  return ambientH(p, t) * uCalm + impactH(p, t) + pulseH(p, t);
}
`;

const WATER_VERT = /* glsl */ `
${WATER_COMMON}
varying vec3 vWorldPos;
void main() {
  vec3 p = position;
  p.y += waterH(p.xz, uTime);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// ─── Shared sky ──────────────────────────────────────────────────────────────
// Procedural night sky (deep gradient + brand nebula + low moon + stars) used
// by BOTH the water's reflections and the sky-dome fragment, plus the horizon
// haze that the water's distance fog and the dome's horizon both converge on.
// That shared color is what makes the ocean rim invisible.
const SKY_COMMON = /* glsl */ `
uniform vec3 uBrand;

float hash21(vec2 q) {
  q = fract(q * vec2(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

vec3 hazeColor() {
  return vec3(0.018, 0.027, 0.050) + uBrand * 0.03;
}

// starAmp: 1.0 for the dome, well under 1 for water reflections — real waves
// shatter star reflections into faint speckle, and dimming them also hides
// any residual cell-magnification on near-calm water.
vec3 skyColor(vec3 rd, float starAmp) {
  float up = clamp(rd.y, 0.0, 1.0);
  vec3 base = mix(vec3(0.030, 0.045, 0.085), vec3(0.004, 0.006, 0.012), pow(up, 0.4));
  float neb = pow(max(dot(rd, normalize(vec3(-0.42, 0.30, -0.55))), 0.0), 3.0);
  base += uBrand * neb * 0.20;
  // Low moon over the water. Its reflection is what draws the long glint
  // street across the swell toward the camera.
  float md = max(dot(rd, normalize(vec3(-0.48, 0.20, -0.86))), 0.0);
  float disc = smoothstep(0.99962, 0.99987, md);
  float halo = pow(md, 1400.0) * 1.1 + pow(md, 90.0) * 0.18;
  base += vec3(0.92, 0.95, 1.0) * (disc * 2.4 + halo);
  // Stars: hashed cells on a planar projection. The cells themselves are
  // wildly anisotropic (tall near the zenith, wide near the horizon), so a
  // whole lit cell reads as a block/dash. Instead, place a POINT star inside
  // each lit cell and measure the falloff in angular terms (cell height
  // ~ rd.y^2/14, cell width ~ rd.y/14), which keeps stars small and round
  // at every elevation — magnified cells carry dots, never slabs.
  vec2 sp = rd.xz / max(rd.y, 0.05);
  vec2 cell = floor(sp * 14.0);
  float s = hash21(cell);
  vec2 f = fract(sp * 14.0) - vec2(0.25 + 0.5 * hash21(cell + 7.31), 0.25 + 0.5 * hash21(cell + 3.17));
  float y = max(rd.y, 0.05);
  float dAng = length(vec2(f.x * y, f.y * y * y));
  float pt = smoothstep(0.05, 0.012, dAng);
  float star = step(0.992, s) * smoothstep(0.06, 0.35, rd.y) * pt;
  base += vec3(0.9) * star * starAmp;
  return base;
}
`;

const WATER_FRAG = /* glsl */ `
${WATER_COMMON}
${SKY_COMMON}
uniform float uGlow;
uniform float uFlash;
varying vec3 vWorldPos;

vec3 waterNormal(vec2 p, float t) {
  float e = 0.055;
  float hC = waterH(p, t);
  float hX = waterH(p + vec2(e, 0.0), t);
  float hZ = waterH(p + vec2(0.0, e), t);
  return normalize(vec3(-(hX - hC) / e, 1.0, -(hZ - hC) / e));
}

void main() {
  float dist = length(cameraPosition - vWorldPos);
  vec3 N = waterNormal(vWorldPos.xz, uTime);
  // Fade per-pixel wave detail out with distance: kills specular shimmer and
  // aliasing near the horizon while leaving enough normal variance to stretch
  // the moon glint into a street instead of collapsing it to a mirror dot.
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(45.0, 420.0, dist) * 0.8));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = max(dot(N, V), 0.0);
  float f = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.02;
  vec3 refl = skyColor(normalize(R), 0.3);
  // Mirror symmetry at the horizon: the dome hazes its sky features with an
  // ANGULAR ramp, so the reflection must haze the mirror image identically —
  // otherwise grazing water reads BRIGHTER than the sky it reflects and a
  // dark valley pins itself along the horizon line.
  refl = mix(refl, hazeColor(), 1.0 - smoothstep(0.0, 0.18, R.y));

  float r = length(vWorldPos.xz);
  vec3 deep = vec3(0.006, 0.011, 0.020);
  vec3 sub = uBrand * exp(-r * 0.5) * uGlow * 0.55;

  // Light carried on the ripple crests near the impact.
  float te = max(uTime - uImpactTime, 0.0);
  float crest = 0.0;
  if (te > 0.0) {
    float hR = impactH(vWorldPos.xz, uTime);
    crest = clamp(hR * 2.2, 0.0, 1.0) * exp(-r * 0.16) * exp(-te * 0.30);
  }

  vec3 col = mix(deep + sub, refl, f);
  col += sub * 0.35;
  col += uBrand * crest * 0.55;

  // Key light direction matches the moon's azimuth so glints agree with it.
  vec3 L = normalize(vec3(-0.48, 0.34, -0.86));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 170.0) * (0.30 + 0.70 * f);
  col += vec3(0.85, 0.92, 1.0) * spec;

  // Impact flash lighting the water from above.
  col += uBrand * uFlash * exp(-r * 0.75) * 2.2;

  // Atmospheric perspective into the exact haze the sky dome's horizon
  // converges on — by the rim (r≈650) the water is indistinguishable from
  // the sky behind it, so the mesh edge vanishes and the ocean reads as
  // infinite. This is also why the surface can be opaque: the in-scene dome
  // replaced the DOM starfield that used to need to show through.
  float fogF = 1.0 - exp(-dist * 0.006);
  col = mix(col, hazeColor(), fogF);

  // Tone map + gamma (ShaderMaterial output is raw; renderer expects sRGB).
  // MUST match the dome's transform exactly or the horizon seam reappears.
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Sky dome ────────────────────────────────────────────────────────────────
const SKY_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
${SKY_COMMON}
varying vec3 vWorldPos;
void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 col = skyColor(rd, 1.0);
  // Thicken into the shared haze toward the horizon and go pure haze below
  // it — the only below-horizon dome ever visible is the sliver past the
  // ocean rim, and the water's distance fog lands on this same color.
  float h = 1.0 - smoothstep(0.0, 0.18, max(rd.y, 0.0));
  col = mix(col, hazeColor(), h);
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Camera choreography ─────────────────────────────────────────────────────
const CAM_KEYS = [
  { t: 0.0, pos: new THREE.Vector3(0.0, 26.0, 0.02), look: new THREE.Vector3(0, 0, 0) },
  { t: WATER_TIMELINE.dropStart, pos: new THREE.Vector3(1.3, 24.0, 1.8), look: new THREE.Vector3(0, 0, 0) },
  { t: WATER_TIMELINE.impact, pos: new THREE.Vector3(2.8, 16.5, 6.0), look: new THREE.Vector3(0, 0, 0) },
  { t: 3.6, pos: new THREE.Vector3(7.4, 2.4, 9.2), look: new THREE.Vector3(0, 0.4, 0) },
  { t: 5.0, pos: new THREE.Vector3(-6.2, 1.8, 8.4), look: new THREE.Vector3(0, 0.55, 0) },
  { t: WATER_TIMELINE.settle, pos: new THREE.Vector3(0.0, 3.4, 11.2), look: new THREE.Vector3(0, 1.15, 0) },
];

function smootherstep(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

function cameraAt(el: number, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
  const keys = CAM_KEYS;
  if (el <= keys[0]!.t) {
    outPos.copy(keys[0]!.pos);
    outLook.copy(keys[0]!.look);
    return;
  }
  const lastKey = keys[keys.length - 1]!;
  if (el >= lastKey.t) {
    outPos.copy(lastKey.pos);
    outLook.copy(lastKey.look);
    return;
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (el >= a.t && el < b.t) {
      const u = smootherstep((el - a.t) / (b.t - a.t));
      outPos.lerpVectors(a.pos, b.pos, u);
      outLook.lerpVectors(a.look, b.look, u);
      return;
    }
  }
}

// ─── Glow sprite texture (generated, no assets) ──────────────────────────────
function makeGlowTexture(brand: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  // `brand` lives in three's linear working space; canvas bytes are sRGB.
  // Convert first so the sprite glow matches the water's uBrand exactly
  // (writing linear values as sRGB bytes double-gammas the glow darker).
  const srgb = brand.clone().convertLinearToSRGB();
  const r = Math.round(srgb.r * 255);
  const gg = Math.round(srgb.g * 255);
  const b = Math.round(srgb.b * 255);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, `rgba(${r},${gg},${b},0.85)`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Ocean geometry ──────────────────────────────────────────────────────────
// Radial disc: fine linear rings through the ripple zone (vertex displacement
// carries the wave silhouette there), then exponentially sparser rings out to
// a rim at r=650 that sits fogged-out at the horizon. Far cheaper than a
// uniform grid of the same reach, and — unlike the old 90×90 plane — the edge
// can never be seen as a slab because it is beyond the fog convergence point.
const OCEAN_RIM = 650;

function makeOceanGeometry(): THREE.BufferGeometry {
  const SEGS = 168;
  const radii: number[] = [];
  for (let r = 0; r < 26; r += 0.35) radii.push(r);
  let r = 26;
  while (r < OCEAN_RIM) {
    radii.push(r);
    r *= 1.09;
  }
  radii.push(OCEAN_RIM);
  const rings = radii.length;

  const pos = new Float32Array(rings * SEGS * 3);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      const o = (i * SEGS + j) * 3;
      pos[o] = Math.cos(a) * radii[i]!;
      pos[o + 1] = 0;
      pos[o + 2] = Math.sin(a) * radii[i]!;
    }
  }

  // Winding gives +Y face normals (viewed from above); the innermost ring is
  // radius 0, so its quads degenerate into the centre fan — harmless.
  const idx: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < SEGS; j++) {
      const j2 = (j + 1) % SEGS;
      const a = i * SEGS + j;
      const b = i * SEGS + j2;
      const c = (i + 1) * SEGS + j;
      const d = (i + 1) * SEGS + j2;
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// ─── Scene (inside the R3F canvas) ───────────────────────────────────────────
const SPLASH_COUNT = 240;

function WaterScene({ clock }: { clock: WaterClock }) {
  const { gl, scene, camera } = useThree();

  const brand = useMemo(() => brandColor(), []);
  const glowTex = useMemo(() => makeGlowTexture(brand), [brand]);

  const waterGeo = useMemo(() => makeOceanGeometry(), []);

  const waterMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uImpactTime: { value: WATER_TIMELINE.impact },
          uCalm: { value: 0.55 },
          uPulseTime: { value: -1 },
          uPulsePos: { value: new THREE.Vector2(0, 0) },
          uBrand: { value: brand },
          uGlow: { value: 0 },
          uFlash: { value: 0 },
        },
      }),
    [brand]
  );

  // Sky dome: the "background beyond the water". depthWrite off + renderOrder
  // -1 make it a pure backdrop every opaque object draws over.
  const domeGeo = useMemo(() => new THREE.SphereGeometry(880, 48, 32), []);
  const domeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uBrand: { value: brand } },
      }),
    [brand]
  );

  // Splash particle buffers: positions/colors are recomputed parametrically
  // each frame from spawn seeds, so a skipped/hidden timeline stays correct.
  const splash = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(SPLASH_COUNT * 3);
    const col = new Float32Array(SPLASH_COUNT * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const seeds = new Float32Array(SPLASH_COUNT * 5);
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      seeds[i * 5 + 0] = angle;
      seeds[i * 5 + 1] = 0.05 + Math.random() * 0.45; // spawn radius
      seeds[i * 5 + 2] = 2.4 + Math.random() * 3.8; // up speed
      seeds[i * 5 + 3] = 0.6 + Math.random() * 2.4; // out speed
      seeds[i * 5 + 4] = 0.75 + Math.random() * 0.65; // life scale
    }
    return { geo, pos, col, seeds };
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  const dropRef = useRef<THREE.Group>(null);
  const dropGlowRef = useRef<THREE.Sprite>(null);
  const jetRef = useRef<THREE.Sprite>(null);
  const flashRef = useRef<THREE.Sprite>(null);
  const nextPulse = useRef(WATER_TIMELINE.settle + 4);

  const camPos = useMemo(() => new THREE.Vector3(), []);
  const camLook = useMemo(() => new THREE.Vector3(), []);

  // Dispose everything we created imperatively.
  useEffect(() => {
    return () => {
      waterGeo.dispose();
      waterMat.dispose();
      domeGeo.dispose();
      domeMat.dispose();
      splash.geo.dispose();
      glowTex.dispose();
    };
  }, [waterGeo, waterMat, domeGeo, domeMat, splash, glowTex]);

  // Force one compile+render so shader errors surface immediately, even in a
  // backgrounded tab where rAF never fires.
  useEffect(() => {
    try {
      gl.compile(scene, camera);
      gl.render(scene, camera);
    } catch {
      // WebGL hiccup — the frame loop will retry; fallbacks handle total loss.
    }
  }, [gl, scene, camera]);

  useFrame((_, delta) => {
    const el = clockElapsed(clock);
    const T = WATER_TIMELINE;

    // ── Water uniforms ──
    waterMat.uniforms.uTime!.value = el;
    waterMat.uniforms.uFlash!.value = el > T.impact ? Math.exp(-(el - T.impact) * 3.4) : 0;
    // calm → energized at impact → gently calmer as ambient. Delta-scaled
    // damping (~0.04/frame at 60fps) so the settle rate is refresh-rate
    // independent; delta clamped against tab-switch spikes.
    const calmTarget = el < T.impact ? 0.55 : el < T.settle ? 1.0 : 0.75;
    const calmK = 1 - Math.exp(-2.4 * Math.min(delta, 0.1));
    waterMat.uniforms.uCalm!.value += (calmTarget - (waterMat.uniforms.uCalm!.value as number)) * calmK;
    // under-surface glow builds ahead of the modal rise, then breathes
    const build = smootherstep((el - (T.rise - 1.0)) / 1.4) * 1.5;
    const breathe = 0.55 + 0.2 * Math.sin(el * 0.7);
    const mixT = smootherstep((el - T.settle) / 1.5);
    waterMat.uniforms.uGlow!.value = build * (1 - mixT) + breathe * mixT;

    // occasional stray ripples during the ambient loop
    if (el > T.settle && el > nextPulse.current) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 6 + Math.random() * 7;
      (waterMat.uniforms.uPulsePos!.value as THREE.Vector2).set(Math.cos(ang) * rad, Math.sin(ang) * rad);
      waterMat.uniforms.uPulseTime!.value = el;
      nextPulse.current = el + 6 + Math.random() * 3;
    }

    // ── The falling drop ──
    if (dropRef.current) {
      const falling = el >= T.dropStart && el < T.impact;
      dropRef.current.visible = falling;
      if (falling) {
        const u = (el - T.dropStart) / (T.impact - T.dropStart);
        dropRef.current.position.set(0, 0.15 + 21 * (1 - u * u), 0);
        dropRef.current.scale.set(1, 1 + 1.5 * u * u, 1);
        if (dropGlowRef.current) {
          const s = 1.6 + u * 1.2;
          dropGlowRef.current.scale.set(s, s * (1 + u), 1);
        }
      }
    }

    // ── Impact flash sprite ──
    if (flashRef.current) {
      const te = el - T.impact;
      const on = te > 0 && te < 0.9;
      flashRef.current.visible = on;
      if (on) {
        const s = 2 + te * 14;
        flashRef.current.scale.set(s, s * 0.55, 1);
        (flashRef.current.material as THREE.SpriteMaterial).opacity = Math.exp(-te * 4.2);
      }
    }

    // ── Worthington jet ──
    if (jetRef.current) {
      const te = el - T.impact;
      const on = te > 0.28 && te < 1.12;
      jetRef.current.visible = on;
      if (on) {
        const h = Math.sin(Math.PI * ((te - 0.28) / 0.84));
        jetRef.current.scale.set(0.35 + 0.45 * h, 2.4 * h + 0.01, 1);
        jetRef.current.position.set(0, 1.2 * h + 0.05, 0);
        (jetRef.current.material as THREE.SpriteMaterial).opacity = 0.85 * h;
      }
    }

    // ── Crown splash particles (parametric — no incremental state) ──
    if (pointsRef.current) {
      const age = el - T.impact;
      const alive = age > 0 && age < 1.9;
      pointsRef.current.visible = alive;
      if (alive) {
        const g = -7.5;
        for (let i = 0; i < SPLASH_COUNT; i++) {
          const angle = splash.seeds[i * 5 + 0]!;
          const r0 = splash.seeds[i * 5 + 1]!;
          const up = splash.seeds[i * 5 + 2]!;
          const out = splash.seeds[i * 5 + 3]!;
          const life = splash.seeds[i * 5 + 4]! * 1.4;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          let x = ca * r0 + ca * out * age;
          let y = 0.05 + up * age + 0.5 * g * age * age;
          let z = sa * r0 + sa * out * age;
          let fade = Math.max(0, 1 - age / life);
          if (y < 0) {
            y = 0;
            fade = 0;
          }
          splash.pos[i * 3 + 0] = x;
          splash.pos[i * 3 + 1] = y;
          splash.pos[i * 3 + 2] = z;
          const w = fade * fade;
          splash.col[i * 3 + 0] = (0.75 + brand.r * 0.25) * w;
          splash.col[i * 3 + 1] = (0.8 + brand.g * 0.2) * w;
          splash.col[i * 3 + 2] = (0.85 + brand.b * 0.15) * w;
        }
        splash.geo.attributes.position!.needsUpdate = true;
        splash.geo.attributes.color!.needsUpdate = true;
      }
    }

    // ── Flying camera ──
    cameraAt(el, camPos, camLook);
    // hand-held life after the impact, decaying toward settle
    if (el > T.impact && el < T.settle + 1) {
      const amp = Math.exp(-(el - T.impact) * 0.55) * 0.12 + 0.012;
      camPos.x += Math.sin(el * 13.7) * amp;
      camPos.y += Math.sin(el * 17.3 + 2.1) * amp * 0.6;
      camLook.y += Math.sin(el * 11.1) * amp * 0.4;
    }
    // idle drift once ambient
    if (el > T.settle) {
      const t = el - T.settle;
      const inRamp = smootherstep(t / 2.5);
      camPos.x += Math.sin(t * 0.12) * 0.5 * inRamp;
      camPos.y += Math.sin(t * 0.16) * 0.18 * inRamp;
      camPos.z += Math.cos(t * 0.1) * 0.35 * inRamp;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  });

  return (
    <>
      {/* Sky dome backdrop (drawn first), then the opaque ocean over it; the
          additive sprites/points below are transparent and render after both.
          renderOrder={5} keeps their mutual order stable. */}
      <mesh geometry={domeGeo} material={domeMat} frustumCulled={false} renderOrder={-1} />
      <mesh geometry={waterGeo} material={waterMat} frustumCulled={false} />

      {/* Falling luminous drop */}
      <group ref={dropRef} visible={false}>
        <mesh>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshBasicMaterial color={"#ffffff"} />
        </mesh>
        <sprite ref={dropGlowRef} scale={[1.6, 1.6, 1]} renderOrder={5}>
          <spriteMaterial
            map={glowTex}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.9}
          />
        </sprite>
      </group>

      {/* Impact flash */}
      <sprite ref={flashRef} visible={false} position={[0, 0.4, 0]} renderOrder={5}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Worthington jet (rebound column) */}
      <sprite ref={jetRef} visible={false} position={[0, 0.4, 0]} renderOrder={5}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Crown splash */}
      <points ref={pointsRef} geometry={splash.geo} visible={false} frustumCulled={false} renderOrder={5}>
        <pointsMaterial
          size={0.13}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

// ─── Public component ────────────────────────────────────────────────────────
export function WaterCinematic({
  skip,
  onRise,
  onFail,
}: {
  skip: number;
  onRise: () => void;
  /** Renderer creation failed after the WebGL probe passed — caller should
      downgrade to the CSS entrance. */
  onFail: () => void;
}) {
  const clockRef = useRef<WaterClock>({ start: 0, offset: 0 });
  const roseRef = useRef(false);
  const createdRef = useRef(false);

  // Capture the start time exactly once, at mount.
  const startedRef = useRef(false);
  if (!startedRef.current) {
    startedRef.current = true;
    clockRef.current.start = performance.now();
  }

  const fireRise = useCallback(() => {
    if (roseRef.current) return;
    roseRef.current = true;
    onRise();
  }, [onRise]);

  // Wall-clock fallback: the modal must rise even if rAF is throttled.
  useEffect(() => {
    const t = window.setTimeout(fireRise, WATER_TIMELINE.rise * 1000);
    return () => clearTimeout(t);
  }, [fireRise]);

  // Renderer watchdog: three r171 throws inside R3F's async setup when the
  // real context can't be created (probe passed, GPU says no) — R3F swallows
  // it, leaving a permanently blank canvas. If onCreated hasn't fired shortly
  // after mount, hand control back to the CSS entrance. Only measure while
  // the tab is VISIBLE: in a hidden tab R3F defers creation (rAF frozen), and
  // a hidden-mount would otherwise always downgrade a healthy GPU.
  useEffect(() => {
    let t = 0;
    const arm = () => {
      t = window.setTimeout(() => {
        if (!createdRef.current) onFail();
      }, 2000);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVis);
        arm();
      }
    };
    if (document.visibilityState === "visible") arm();
    else document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(t);
    };
  }, [onFail]);

  // Skip: jump the shared timeline to the settled state and rise immediately.
  useEffect(() => {
    if (skip <= 0) return;
    const el = clockElapsed(clockRef.current);
    clockRef.current.offset += Math.max(0, WATER_TIMELINE.settle - el);
    fireRise();
  }, [skip, fireRise]);

  return (
    <div className="gv2-water" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 48, near: 0.1, far: 1600, position: [0, 26, 0.02] }}
        onCreated={({ gl }) => {
          createdRef.current = true;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <WaterScene clock={clockRef.current} />
      </Canvas>
    </div>
  );
}
