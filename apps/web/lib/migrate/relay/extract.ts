// Defensive extraction of a preview from an unknown-shaped Relay.app workflow
// JSON. We have never seen a real export (Relay closed signups before winding
// down), and Relay warns its JSON structure differs from every other tool's, so
// this makes NO assumptions about field names. It scans broadly, matches string
// leaves against the mapping table, and never throws — the worst case is an
// empty-ish preview, which the wizard shows as "couldn't read structure, will
// rely on the build prompt."
//
// Two consumers: the browser wizard (preview cards + coverage) and the
// converter (detected providers → which operation catalogs to load into the
// prompt). Both are best-effort hints, never a parsed contract.

import { RELAY_TRIGGER_MAP, resolveRelayApp, type RelayAppResolution } from "./mapping";

export type DetectedApp = {
  raw: string;
  resolution: RelayAppResolution;
};

export type RelayWorkflowPreview = {
  name: string;
  stepCount: number;
  apps: DetectedApp[];
  triggerTypes: string[]; // Corelyx trigger_type values, e.g. ["cron"]
  // Providers (connector slugs) we can load operation docs for, deduped.
  providers: string[];
};

// Bound the walk so a pathological export can't hang the browser tab.
const MAX_NODES = 20_000;
const MAX_DEPTH = 40;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Keys whose string value most likely names an app/integration.
const APP_KEY_RE = /^(app|app_?name|appid|app_?id|service|integration|connector|provider|vendor|platform)$/i;
// Keys that most likely hold a workflow/step name or type.
const NAME_KEY_RE = /^(name|title|label|workflow_?name|display_?name)$/i;
const TYPE_KEY_RE = /^(type|kind|step_?type|action_?type|node_?type|category)$/i;
const TRIGGER_KEY_RE = /^(trigger|trigger_?type|start|event)$/i;
// Keys whose array value is most likely the list of steps.
const STEP_ARRAY_KEY_RE = /^(steps|nodes|actions|blocks|elements|children|items|stages)$/i;

function extractName(root: unknown): string {
  if (isRecord(root)) {
    for (const key of Object.keys(root)) {
      if (NAME_KEY_RE.test(key) && typeof root[key] === "string" && root[key]) {
        return (root[key] as string).slice(0, 200);
      }
    }
    // A nested { workflow: { name } } is common.
    for (const key of ["workflow", "definition", "data"]) {
      if (isRecord(root[key])) {
        const nested = extractName(root[key]);
        if (nested !== "Untitled Relay workflow") return nested;
      }
    }
  }
  return "Untitled Relay workflow";
}

function countSteps(root: unknown): number {
  let max = 0;
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (STEP_ARRAY_KEY_RE.test(key) && Array.isArray(child)) {
        // Count only object-shaped entries — a "tags" array of strings named
        // "items" shouldn't inflate the step count.
        const objCount = child.filter((c) => isRecord(c)).length;
        if (objCount > max) max = objCount;
      }
      visit(child, depth + 1);
    }
  };
  try {
    visit(root, 0);
  } catch {
    /* never throw */
  }
  return max;
}

/**
 * Walk the whole structure collecting candidate app strings and trigger types.
 * Two signals for apps: (a) a value under an app-ish key, (b) any string leaf
 * that resolves to a real Corelyx connector/agent (catches odd shapes where the
 * app is embedded in a type like "gmail.send_email"). Gap-only matches from (b)
 * are ignored to avoid flooding the preview with false positives from prose.
 */
function scan(root: unknown): { apps: DetectedApp[]; triggerTypes: Set<string> } {
  const apps: DetectedApp[] = [];
  const seenApps = new Set<string>();
  const triggerTypes = new Set<string>();
  let nodeBudget = MAX_NODES;

  const addApp = (raw: string, requireStrong: boolean) => {
    // Prefer a confident whole-string match; else try the leading segment, so
    // Relay types like "gmail.send_email" or "slack:send_message" still resolve.
    let res = resolveRelayApp(raw);
    if (!res || res.status === "gap") {
      const seg = raw.split(/[.:/\s]/)[0];
      if (seg && seg.length > 1 && seg !== raw) {
        const segRes = resolveRelayApp(seg);
        if (segRes && segRes.status !== "gap") res = segRes;
      }
    }
    if (!res) return;
    // From a generic string leaf (requireStrong), only trust confident matches
    // — a real connector or a known agent provider — never a gap guess.
    if (requireStrong && res.status === "gap") return;
    const dedupeKey = `${res.status}:${res.label}`;
    if (seenApps.has(dedupeKey)) return;
    seenApps.add(dedupeKey);
    apps.push({ raw, resolution: res });
  };

  const addTrigger = (raw: string) => {
    const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const mapped = RELAY_TRIGGER_MAP[key];
    if (mapped) triggerTypes.add(mapped);
  };

  const visit = (value: unknown, depth: number, underAppKey: boolean, underTriggerKey: boolean): void => {
    if (nodeBudget-- <= 0 || depth > MAX_DEPTH) return;

    if (typeof value === "string") {
      if (underAppKey) addApp(value, false);
      else addApp(value, true);
      if (underTriggerKey) addTrigger(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, underAppKey, underTriggerKey);
      return;
    }
    if (!isRecord(value)) return;

    // A trigger sub-object: read its type field even if the key nesting differs.
    for (const [key, child] of Object.entries(value)) {
      const isAppKey = APP_KEY_RE.test(key);
      const isTriggerKey = TRIGGER_KEY_RE.test(key);
      const isTypeKey = TYPE_KEY_RE.test(key);
      // A `type`/`kind` under a trigger-ish parent describes the trigger; under
      // anything else it may name an app or step. Feed both resolvers loosely.
      if (isTypeKey && typeof child === "string") {
        addTrigger(child);
        addApp(child, true);
      }
      visit(child, depth + 1, isAppKey, isTriggerKey);
    }
  };

  try {
    visit(root, 0, false, false);
  } catch {
    /* never throw */
  }
  return { apps, triggerTypes };
}

/**
 * Build a best-effort preview from an unknown Relay workflow JSON value.
 * `fallbackName` (e.g. a folder name from the zip) is used when no name field
 * is found.
 */
export function extractRelayWorkflowPreview(root: unknown, fallbackName?: string): RelayWorkflowPreview {
  const name = (() => {
    const found = extractName(root);
    if (found !== "Untitled Relay workflow") return found;
    return fallbackName?.trim() || found;
  })();

  const stepCount = countSteps(root);
  const { apps, triggerTypes } = scan(root);

  const providers = [
    ...new Set(
      apps
        .map((a) => (a.resolution.status === "connector" ? a.resolution.provider : null))
        .filter((p): p is string => !!p)
    ),
  ];

  return {
    name,
    stepCount,
    apps,
    triggerTypes: [...triggerTypes],
    providers,
  };
}

/**
 * Parse a raw JSON string into a preview, tolerating markdown fences and
 * surrounding noise. Returns null only if no JSON object can be recovered at
 * all (in which case the caller should fall back to the build prompt alone).
 */
export function previewFromJsonString(raw: string, fallbackName?: string): RelayWorkflowPreview | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()];
  for (const candidate of candidates) {
    try {
      return extractRelayWorkflowPreview(JSON.parse(candidate), fallbackName);
    } catch {
      /* try next */
    }
  }
  return null;
}
