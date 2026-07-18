export type PlatformModelTier = "free" | "standard" | "premium";

export type PlatformModelOption = {
  id: string;
  label: string;
  sublabel: string;
  tier: PlatformModelTier;
};

/**
 * OpenRouter's own free-tier models (":free" slugs, "openrouter/free") proved
 * unreliable in practice — small/rotating upstream provider pools that get
 * rate-limited quickly — so the platform no longer offers them at all. Every
 * plan, including Free, now runs on this same real (billed) model; Free plan
 * is bounded by a small included credit allowance instead of model choice.
 */
export const PLATFORM_DEFAULT_MODEL = "openai/gpt-4o-mini";

/** Agents were pinned to this separately for reliable tool-calling; now the same as the platform default. */
export const AGENT_PLATFORM_DEFAULT_MODEL = PLATFORM_DEFAULT_MODEL;

/**
 * Used only when OpenRouter's model catalog is temporarily unavailable. The
 * normal catalog is loaded from OpenRouter and cached by the server.
 */
export const PLATFORM_MODEL_FALLBACK_CATALOG: PlatformModelOption[] = [
  {
    id: PLATFORM_DEFAULT_MODEL,
    label: "OpenAI: GPT-4o Mini",
    sublabel: "Fast and affordable",
    tier: "standard",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Anthropic: Claude Sonnet 4.6",
    sublabel: "High quality",
    tier: "standard",
  },
];

/**
 * OpenRouter documents `:free` and `openrouter/free` as its free model IDs.
 * Used only to filter these out of the catalog we ever show or select —
 * not exposed as a selectable "free" model tier anymore.
 */
export function isFreeOpenRouterModel(modelId: string): boolean {
  return modelId === "openrouter/free" || modelId.endsWith(":free");
}

/**
 * All paid Corelyx plans may use every model in the catalog. Plan differences
 * are expressed through included credits, not an artificial model allowlist —
 * except Free plan, which is restricted to the one default model (see
 * isPlatformModelAllowed) since it doesn't carry a full credit allowance.
 */
export function getPlatformModelTier(_modelId: string): PlatformModelTier {
  return "standard";
}

/** Free plan may only use the platform default model, bounded by its small included-credit allowance. */
export function isPlatformModelAllowed(
  modelId: string,
  accessTier: PlatformModelTier
): boolean {
  return accessTier !== "free" || modelId === PLATFORM_DEFAULT_MODEL;
}

export function getAllowedPlatformModels(
  accessTier: PlatformModelTier,
  catalog: PlatformModelOption[] = PLATFORM_MODEL_FALLBACK_CATALOG
): PlatformModelOption[] {
  return catalog.filter((model) => isPlatformModelAllowed(model.id, accessTier));
}

type OpenRouterModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
};

function formatContextLength(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M context`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K context`;
  return `${value} context`;
}

function buildSublabel(model: OpenRouterModel): string {
  return formatContextLength(model.context_length) ?? "";
}

/** Convert the complete OpenRouter `/models` payload into UI-safe options. */
export function toPlatformModelCatalog(models: unknown): PlatformModelOption[] {
  if (!Array.isArray(models)) return [];

  const byId = new Map<string, PlatformModelOption>();
  for (const raw of models as OpenRouterModel[]) {
    if (typeof raw?.id !== "string" || !raw.id.trim()) continue;
    const id = raw.id.trim();
    // OpenRouter's own free-tier variants are excluded outright — see
    // PLATFORM_DEFAULT_MODEL's comment. Nobody selects these anymore.
    if (isFreeOpenRouterModel(id)) continue;
    byId.set(id, {
      id,
      label: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
      sublabel: buildSublabel(raw),
      tier: "standard",
    });
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}
