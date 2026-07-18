export type PlatformModelTier = "free" | "standard" | "premium";

export type PlatformModelOption = {
  id: string;
  label: string;
  sublabel: string;
  tier: PlatformModelTier;
};

/**
 * OpenRouter's free router is a more durable default than a single free model:
 * it automatically selects from the free models that are currently available.
 */
export const PLATFORM_DEFAULT_MODEL = "openrouter/free";

/** Agent tool loops are a paid feature and need a dependable tool-calling model. */
export const AGENT_PLATFORM_DEFAULT_MODEL = "openai/gpt-4o-mini";

/**
 * Used only when OpenRouter's model catalog is temporarily unavailable. The
 * normal catalog is loaded from OpenRouter and cached by the server.
 */
export const PLATFORM_MODEL_FALLBACK_CATALOG: PlatformModelOption[] = [
  {
    id: PLATFORM_DEFAULT_MODEL,
    label: "Free Models Router",
    sublabel: "Free · Automatically selects an available free model",
    tier: "free",
  },
  {
    id: AGENT_PLATFORM_DEFAULT_MODEL,
    label: "OpenAI: GPT-4o Mini",
    sublabel: "Paid · Fast and affordable",
    tier: "standard",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Anthropic: Claude Sonnet 4.6",
    sublabel: "Paid · High quality",
    tier: "standard",
  },
];

/** OpenRouter documents `:free` and `openrouter/free` as its free model IDs. */
export function isFreeOpenRouterModel(modelId: string): boolean {
  return modelId === PLATFORM_DEFAULT_MODEL || modelId.endsWith(":free");
}

/**
 * All paid Corelyx plans may use every paid OpenRouter model. Plan differences
 * are expressed through included credits, not an artificial model allowlist.
 */
export function getPlatformModelTier(modelId: string): PlatformModelTier {
  return isFreeOpenRouterModel(modelId) ? "free" : "standard";
}

export function isPlatformModelAllowed(
  modelId: string,
  accessTier: PlatformModelTier
): boolean {
  return accessTier !== "free" || isFreeOpenRouterModel(modelId);
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
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
  } | null;
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

function formatPerMillion(value: unknown): string | null {
  const perToken = typeof value === "string" ? Number(value) : value;
  if (typeof perToken !== "number" || !Number.isFinite(perToken) || perToken < 0) return null;
  const perMillion = perToken * 1_000_000;
  if (perMillion === 0) return "$0";
  if (perMillion < 0.01) return `$${perMillion.toFixed(3)}`;
  if (perMillion < 1) return `$${perMillion.toFixed(2)}`;
  return `$${perMillion.toFixed(2).replace(/\.00$/, "")}`;
}

function buildSublabel(model: OpenRouterModel, tier: PlatformModelTier): string {
  const context = formatContextLength(model.context_length);
  if (tier === "free") return ["Free", context].filter(Boolean).join(" · ");

  const prompt = formatPerMillion(model.pricing?.prompt);
  const completion = formatPerMillion(model.pricing?.completion);
  const price = prompt === "$0" && completion === "$0"
    ? "Usage-based pricing"
    : prompt && completion
      ? `${prompt}/M input · ${completion}/M output`
      : "Variable pricing";
  return ["Paid", price, context].filter(Boolean).join(" · ");
}

/** Convert the complete OpenRouter `/models` payload into UI-safe options. */
export function toPlatformModelCatalog(models: unknown): PlatformModelOption[] {
  if (!Array.isArray(models)) return [];

  const byId = new Map<string, PlatformModelOption>();
  for (const raw of models as OpenRouterModel[]) {
    if (typeof raw?.id !== "string" || !raw.id.trim()) continue;
    const id = raw.id.trim();
    const tier = getPlatformModelTier(id);
    byId.set(id, {
      id,
      label: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
      sublabel: buildSublabel(raw, tier),
      tier,
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "free" ? -1 : 1;
    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });
}
