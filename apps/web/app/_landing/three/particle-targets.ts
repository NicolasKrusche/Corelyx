/* Particle formation targets for the cinematic WebGL layer.
   All positions are in world units for a camera at z≈14, fov 60 —
   keep shapes roughly within x ±13, y ±7, z ±6.

   Each formation gets a position + color + size array of `count` particles.
   The ParticleField blends between two formations on the CPU each frame and
   layers formation-specific motion (wave, jitter, ring rotation) on top. */

export const FORMATIONS = ["signal", "chaos", "graph", "field", "vault", "orbit", "calm"] as const;
export type Formation = (typeof FORMATIONS)[number];

export type FormationData = {
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
};

export type TargetSet = Record<Formation, FormationData> & { seed: Float32Array };

/* Palette (matches SCENE colors in scene-kit) */
const CYAN: RGB = [0.22, 0.74, 0.97]; // #38bdf8
const BLUE: RGB = [0.36, 0.55, 1.0]; // #5b8cff
const GREEN: RGB = [0.2, 0.83, 0.6]; // #34d399
const AMBER: RGB = [0.96, 0.69, 0.3]; // #f5b14c
const RED: RGB = [0.94, 0.34, 0.25]; // #f0563f
const BRAND: RGB = [0.94, 0.35, 0.16]; // #f05a28
const WHITE: RGB = [0.92, 0.96, 1.0];
const SLATE: RGB = [0.42, 0.5, 0.65];

type RGB = [number, number, number];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function put(arr: Float32Array, i: number, x: number, y: number, z: number) {
  arr[i * 3] = x;
  arr[i * 3 + 1] = y;
  arr[i * 3 + 2] = z;
}

function putColor(arr: Float32Array, i: number, [r, g, b]: RGB, brightness = 1) {
  arr[i * 3] = r * brightness;
  arr[i * 3 + 1] = g * brightness;
  arr[i * 3 + 2] = b * brightness;
}

/* ── The canonical workflow graph (mirrors SystemGraph coordinates) ── */
const GRAPH_NODES: { x: number; y: number; tone: RGB }[] = [
  { x: 10, y: 48, tone: CYAN }, // trigger
  { x: 30, y: 22, tone: BLUE }, // ai
  { x: 30, y: 74, tone: BLUE }, // policy
  { x: 52, y: 48, tone: AMBER }, // approval
  { x: 73, y: 24, tone: CYAN }, // action
  { x: 73, y: 72, tone: GREEN }, // log
  { x: 92, y: 48, tone: GREEN }, // export
];
const GRAPH_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [3, 5],
  [4, 6],
  [5, 6],
];

/** Map SystemGraph 0..100 coords into world space. */
function graphToWorld(cx: number, cy: number): [number, number] {
  return [((cx - 50) / 50) * 8.6, ((50 - cy) / 50) * 3.4];
}

function bezier(p1: [number, number], p2: [number, number], t: number): [number, number] {
  // Same horizontal-S curve the DOM SVG edges use.
  const mx = (p1[0] + p2[0]) / 2;
  const u = 1 - t;
  const x = u * u * u * p1[0] + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * p2[0];
  const y = u * u * u * p1[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p2[1];
  return [x, y];
}

export function buildTargets(count: number): TargetSet {
  const rand = mulberry32(1337);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = rand();

  const make = (): FormationData => ({
    pos: new Float32Array(count * 3),
    col: new Float32Array(count * 3),
    size: new Float32Array(count),
  });

  /* ── signal: a flowing ribbon of light across the screen ── */
  const signal = make();
  for (let i = 0; i < count; i++) {
    const t = rand();
    const x = -15 + t * 30;
    const y = Math.sin(t * Math.PI * 2.4 + 0.6) * 1.7 + (rand() - 0.5) * 1.5 * (0.4 + rand());
    const z = (rand() - 0.5) * 3.5;
    put(signal.pos, i, x, y, z);
    const c = rand();
    putColor(signal.col, i, c > 0.92 ? WHITE : c > 0.45 ? CYAN : BLUE, 0.65 + rand() * 0.35);
    signal.size[i] = 1.2 + rand() * 2.4;
  }

  /* ── chaos: an unstructured node cloud with risk-tinted particles.
     Min radius keeps the centre clear enough for the scene copy. ── */
  const chaos = make();
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = 4.5 + Math.pow(rand(), 0.7) * 7.5;
    const x = r * Math.sin(phi) * Math.cos(theta) * 1.35;
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.62;
    const z = r * Math.cos(phi) * 0.75;
    put(chaos.pos, i, x, y, z);
    const c = rand();
    putColor(
      chaos.col,
      i,
      c > 0.88 ? RED : c > 0.72 ? AMBER : c > 0.35 ? CYAN : SLATE,
      0.55 + rand() * 0.45,
    );
    chaos.size[i] = 1.0 + rand() * 2.6;
  }

  /* ── graph: chaos resolves into the canonical workflow shape ── */
  const graph = make();
  for (let i = 0; i < count; i++) {
    const onEdge = rand() < 0.55;
    if (onEdge) {
      const [a, b] = GRAPH_EDGES[Math.floor(rand() * GRAPH_EDGES.length)];
      const p1 = graphToWorld(GRAPH_NODES[a].x, GRAPH_NODES[a].y);
      const p2 = graphToWorld(GRAPH_NODES[b].x, GRAPH_NODES[b].y);
      const [x, y] = bezier(p1, p2, rand());
      put(graph.pos, i, x + (rand() - 0.5) * 0.22, y + (rand() - 0.5) * 0.22, (rand() - 0.5) * 0.8);
      putColor(graph.col, i, rand() > 0.5 ? CYAN : BLUE, 0.5 + rand() * 0.4);
      graph.size[i] = 0.9 + rand() * 1.4;
    } else {
      const n = GRAPH_NODES[Math.floor(rand() * GRAPH_NODES.length)];
      const [nx, ny] = graphToWorld(n.x, n.y);
      const a = rand() * Math.PI * 2;
      const rr = Math.pow(rand(), 1.6) * 0.7;
      put(graph.pos, i, nx + Math.cos(a) * rr, ny + Math.sin(a) * rr, (rand() - 0.5) * 1.1);
      putColor(graph.col, i, n.tone, 0.7 + rand() * 0.3);
      graph.size[i] = 1.3 + rand() * 2.2;
    }
  }

  /* ── field: sparse ambient depth field (recedes behind product UI) ── */
  const field = make();
  for (let i = 0; i < count; i++) {
    put(field.pos, i, (rand() - 0.5) * 32, (rand() - 0.5) * 18, -9 + rand() * 6);
    putColor(field.col, i, rand() > 0.75 ? CYAN : SLATE, 0.25 + rand() * 0.3);
    field.size[i] = 0.8 + rand() * 1.6;
  }

  /* ── vault: boundary shells around a warm core ── */
  const vault = make();
  for (let i = 0; i < count; i++) {
    const kind = rand();
    if (kind < 0.5) {
      // outer boundary ring, tilted
      const a = rand() * Math.PI * 2;
      const r = 4.6 + (rand() - 0.5) * 0.35;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.55;
      const z = Math.sin(a) * 1.9;
      put(vault.pos, i, x, y, z);
      putColor(vault.col, i, rand() > 0.85 ? WHITE : BRAND, 0.6 + rand() * 0.4);
      vault.size[i] = 1.1 + rand() * 1.8;
    } else if (kind < 0.82) {
      // inner counter-tilted ring
      const a = rand() * Math.PI * 2;
      const r = 3.0 + (rand() - 0.5) * 0.3;
      put(vault.pos, i, Math.cos(a) * r, Math.sin(a) * r * 0.75, -Math.sin(a) * 1.2);
      putColor(vault.col, i, rand() > 0.8 ? GREEN : AMBER, 0.5 + rand() * 0.4);
      vault.size[i] = 1.0 + rand() * 1.5;
    } else {
      // core cluster
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const r = Math.pow(rand(), 1.8) * 1.0;
      put(
        vault.pos,
        i,
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      putColor(vault.col, i, rand() > 0.6 ? WHITE : BRAND, 0.8 + rand() * 0.2);
      vault.size[i] = 1.4 + rand() * 2.4;
    }
  }

  /* ── orbit: three concentric integration rings ── */
  const orbit = make();
  const RINGS = [3.0, 4.6, 6.4];
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(rand() * 3);
    const r = RINGS[ring] + (rand() - 0.5) * 0.25;
    const a = rand() * Math.PI * 2;
    const tilt = 0.5 + ring * 0.12;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * Math.cos(tilt);
    const z = Math.sin(a) * r * Math.sin(tilt) * 0.7;
    put(orbit.pos, i, x, y, z);
    const c = rand();
    putColor(orbit.col, i, c > 0.9 ? WHITE : c > 0.45 ? CYAN : BLUE, 0.5 + rand() * 0.45);
    orbit.size[i] = 0.9 + rand() * 1.8;
  }

  /* ── calm: the governed system at rest (graph, green and settled) ── */
  const calm = make();
  for (let i = 0; i < count; i++) {
    const x = graph.pos[i * 3] * 1.18;
    const y = graph.pos[i * 3 + 1] * 1.18;
    const z = graph.pos[i * 3 + 2];
    put(calm.pos, i, x, y, z);
    const c = rand();
    putColor(calm.col, i, c > 0.75 ? GREEN : c > 0.35 ? CYAN : BLUE, 0.55 + rand() * 0.35);
    calm.size[i] = graph.size[i];
  }

  return { signal, chaos, graph, field, vault, orbit, calm, seed };
}
