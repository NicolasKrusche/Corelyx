import {
  PLATFORM_MODEL_FALLBACK_CATALOG,
  toPlatformModelCatalog,
  type PlatformModelOption,
} from "@/lib/genesis/platform-models";

const OPENROUTER_MODELS_URL =
  "https://openrouter.ai/api/v1/models?output_modalities=text";

/**
 * Load every current text-output OpenRouter model. Next's data cache keeps the
 * catalog fast while refreshing it hourly as models and prices change.
 */
export async function getOpenRouterModelCatalog(): Promise<PlatformModelOption[]> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter model catalog returned ${response.status}`);
    }

    const payload = await response.json() as { data?: unknown };
    const models = toPlatformModelCatalog(payload.data);
    if (models.length === 0) throw new Error("OpenRouter model catalog was empty");
    return models;
  } catch {
    return PLATFORM_MODEL_FALLBACK_CATALOG;
  }
}
