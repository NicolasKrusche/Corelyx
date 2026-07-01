/* Shared, render-free scroll state for the cinematic landing.
   Each scene's ScrollTrigger reports its own 0..1 progress here; the WebGL
   layer reads the values every frame without triggering React re-renders.

   Because the scenes are strictly sequential (earlier triggers sit at 1 once
   passed, later ones at 0 until reached), the sum of all progresses is a
   monotonic "story position" in 0..12 that the particle system keys off. */

export const SCENE_ORDER = [
  "hero",
  "chaos",
  "graph",
  "builder",
  "governance",
  "vault",
  "approval",
  "audit",
  "orbit",
  "usecases",
  "trust",
  "final",
] as const;

export type SceneName = (typeof SCENE_ORDER)[number];

export const sceneProgress: Record<SceneName, number> = {
  hero: 0,
  chaos: 0,
  graph: 0,
  builder: 0,
  governance: 0,
  vault: 0,
  approval: 0,
  audit: 0,
  orbit: 0,
  usecases: 0,
  trust: 0,
  final: 0,
};

/** ScrollTrigger onUpdate callback factory. */
export function reportSceneProgress(name: SceneName) {
  return (self: { progress: number }) => {
    sceneProgress[name] = self.progress;
  };
}

export function storyPosition() {
  let s = 0;
  for (const name of SCENE_ORDER) s += sceneProgress[name];
  return s;
}

export function resetSceneProgress() {
  for (const name of SCENE_ORDER) sceneProgress[name] = 0;
}

/** Normalized pointer (-1..1), used for camera parallax. */
export const pointer = { x: 0, y: 0 };
