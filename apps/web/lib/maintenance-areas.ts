// Scoped maintenance: independently disable individual parts of the app while
// the rest stays up. Edge-safe (no Node-only imports) so middleware can use it.
//
// Each area owns a set of path prefixes (UI pages and/or API routes). When an
// area is disabled, requests matching it are blocked (admins bypass); everything
// else keeps working. Optional `methods` limits the block to mutating requests
// so read-only browsing of an area can stay available.

import type { SystemFlags } from "@/lib/system-flags";

export interface MaintenanceArea {
  key: string;
  label: string;
  description: string;
  /** Path prefixes this area owns (UI pages and/or API routes). */
  prefixes: string[];
  /** When set, only these HTTP methods are blocked; others pass through. */
  methods?: string[];
}

export const MAINTENANCE_AREAS: MaintenanceArea[] = [
  {
    key: "genesis",
    label: "AI generation (Genesis)",
    description: "Generating and refining workflows & agents with AI.",
    prefixes: ["/api/genesis", "/api/programs/generate"],
  },
  {
    key: "execution",
    label: "Workflow & agent runs",
    description: "Starting workflow and agent runs (viewing past runs still works).",
    prefixes: ["/api/runs", "/api/agents"],
    methods: ["POST", "PUT", "PATCH", "DELETE"],
  },
  {
    key: "editor",
    label: "Workflow editor",
    description: "Opening and editing workflows on the canvas.",
    prefixes: ["/programs", "/api/programs"],
  },
  {
    key: "connections",
    label: "Connections & OAuth",
    description: "Connecting apps and running OAuth flows.",
    prefixes: ["/connections", "/api/connections"],
  },
  {
    key: "billing",
    label: "Billing & checkout",
    description: "Plans, checkout, and credit purchases.",
    prefixes: ["/api/billing", "/api/checkout", "/api/credits"],
  },
];

const AREA_BY_KEY = new Map(MAINTENANCE_AREAS.map((a) => [a.key, a]));

export function getMaintenanceArea(key: string): MaintenanceArea | undefined {
  return AREA_BY_KEY.get(key);
}

/**
 * The set of currently-disabled area keys, merging the explicit `disabledAreas`
 * list with the legacy genesis/execution booleans (still honored as env
 * break-glass overrides). Unknown keys are dropped.
 */
export function activeDisabledAreaKeys(flags: SystemFlags): string[] {
  const keys = new Set<string>(Array.isArray(flags.disabledAreas) ? flags.disabledAreas : []);
  if (flags.disableGenesis) keys.add("genesis");
  if (flags.disableExecution) keys.add("execution");
  return [...keys].filter((k) => AREA_BY_KEY.has(k));
}

/** Returns the first disabled area that blocks this request, or null. */
export function matchDisabledArea(
  flags: SystemFlags,
  pathname: string,
  method: string
): MaintenanceArea | null {
  for (const key of activeDisabledAreaKeys(flags)) {
    const area = AREA_BY_KEY.get(key)!;
    if (!area.prefixes.some((p) => pathname.startsWith(p))) continue;
    if (area.methods && !area.methods.includes(method.toUpperCase())) continue;
    return area;
  }
  return null;
}
