import type { ProgramSchema } from "@flowos/schema";
import { z } from "zod";

export type GenesisConnectionRow = {
  id: string;
  name: string;
  provider: string;
  scopes: string[] | null;
};

export type GenesisApiKeyRow = {
  id: string;
  vault_secret_id: string;
  provider: string;
};

export const GenesisRequestSchema = z.object({
  description: z.string().max(2000),
  // Upper bound is a sanity guard, not a product limit — Genesis selects what it
  // needs from the provided connections. Note: very many connections enlarge the
  // operation-reference section of the prompt, and the model's output token budget
  // (GENESIS_MAX_TOKENS) still bounds how large a single generated graph can be.
  connection_ids: z.array(z.string().uuid()).max(250),
  api_key_id: z.string().uuid().optional(),
  use_platform_key: z.boolean().optional(),
  model: z.string().min(1).optional(),
  existing_schema: z.unknown().optional(),
  refinement: z.string().max(2000).optional(),
  existing_program_id: z.string().uuid().optional(),
  // Preferred auto-layout orientation for the generated graph. The server lays
  // the program out deterministically (the model is unreliable at coordinates).
  layout_direction: z.enum(["horizontal", "vertical"]).optional(),
  // "agent" generates a one-time agent (program_type:"agent") instead of a
  // repeating workflow. Absent = workflow, preserving existing behavior.
  program_type: z.enum(["workflow", "agent"]).optional(),
}).superRefine((request, ctx) => {
  if (!isGenesisRefinementRequest(request) && request.description.length < 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 10,
      type: "string",
      inclusive: true,
      exact: false,
      path: ["description"],
      message: "String must contain at least 10 character(s)",
    });
  }
});

export function isGenesisRefinementRequest(request: {
  existing_schema?: unknown;
  refinement?: string;
  existing_program_id?: string;
}): boolean {
  return !!(request.existing_schema && request.refinement && request.existing_program_id);
}

// ─── Platform model catalog ───────────────────────────────────────────────────
// Models available when using the Corelyx platform key (via OpenRouter).
// "free" tier models cost nothing; "paid" tier models are billed against the
// user's includedAiCredits. All IDs are OpenRouter model strings.

// "free"     → Qwen3 Coder only (Free plan)
// "standard" → + Claude 3 Haiku, GPT-4o Mini (Solo)
// "premium"  → + Claude Sonnet 4.6, GPT-4o   (Team / Scale)
export type PlatformModelTier = "free" | "standard" | "premium";

export type PlatformModelOption = {
  id: string;
  label: string;
  sublabel: string;
  tier: PlatformModelTier; // minimum tier required to use this model
};

export const PLATFORM_MODEL_CATALOG: PlatformModelOption[] = [
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B",
    sublabel: "Free · Fast",
    tier: "free",
  },
  {
    id: "anthropic/claude-3-haiku",
    label: "Claude 3 Haiku",
    sublabel: "Fast · Efficient",
    tier: "standard",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    sublabel: "Fast · Affordable",
    tier: "standard",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    sublabel: "Best quality",
    tier: "premium",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    sublabel: "Powerful",
    tier: "premium",
  },
];

/** The model ID used when the user hasn't picked one (free tier default). */
export const PLATFORM_DEFAULT_MODEL = "openai/gpt-oss-120b:free";

/** Returns allowed models for a given platform tier (all models whose tier ≤ userTier). */
export function getAllowedPlatformModels(tier: PlatformModelTier): PlatformModelOption[] {
  const ORDER: PlatformModelTier[] = ["free", "standard", "premium"];
  const userLevel = ORDER.indexOf(tier);
  return PLATFORM_MODEL_CATALOG.filter((m) => ORDER.indexOf(m.tier) <= userLevel);
}

// ─── OpenRouter fallback chain ────────────────────────────────────────────────

// Free OpenRouter models tried in order. Keep only slugs OpenRouter currently
// serves — a removed/renamed slug returns "404 No endpoints found", and if it is
// the last entry there is nothing left to fall back to, so the 404 surfaces to
// the user. (google/gemma-3-27b-it:free was removed upstream and dropped here.)
// qwen/qwen3-coder:free was dropped too — its endpoints stopped responding and
// every attempt timed out before falling through, so generation now starts on
// gpt-oss directly.
export const OPENROUTER_FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
] as const;

export const KEY_PROVIDER_PRIORITY: Record<string, number> = {
  anthropic: 0,
  openai: 1,
  openrouter: 2,
  mistral: 3,
  google: 4,
  groq: 5,
};

export const KEY_DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-1.5-pro",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  openrouter: "openai/gpt-oss-120b:free",
};

// Output token budget for a single generation. Larger graphs need more output
// tokens; raised to allow many-node programs. Providers clamp this to the model's
// own max output, so a model with a smaller cap will simply use its maximum.
// Override per-deployment with GENESIS_MAX_TOKENS.
export const GENESIS_MAX_TOKENS = (() => {
  const parsed = Number.parseInt(process.env.GENESIS_MAX_TOKENS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16384;
})();
export const GENESIS_TEMPERATURE = 0;

export function uniqueRequestedConnectionIds(connectionIds: string[]): string[] {
  return [...new Set(connectionIds)];
}

export function getMissingConnectionIds(
  requestedConnectionIds: string[],
  connections: Pick<GenesisConnectionRow, "id">[]
): string[] {
  const foundIds = new Set(connections.map((connection) => connection.id));
  return requestedConnectionIds.filter((id) => !foundIds.has(id));
}

export function toGenesisConnectionList(connections: GenesisConnectionRow[]) {
  return connections.map((connection) => ({
    name: connection.name,
    type: connection.provider,
    scopes: connection.scopes ?? [],
  }));
}

export function toProgramConnectionLinks(programId: string, connections: GenesisConnectionRow[]) {
  return connections.map((connection) => ({
    program_id: programId,
    connection_id: connection.id,
  }));
}

export function sortApiKeyFallbacks(preferredKeyId: string, keys: GenesisApiKeyRow[]): GenesisApiKeyRow[] {
  const preferred = keys.find((key) => key.id === preferredKeyId);
  if (!preferred) return [];

  const rest = keys
    .filter((key) => key.id !== preferredKeyId)
    .sort(
      (a, b) =>
        (KEY_PROVIDER_PRIORITY[a.provider] ?? 99) -
        (KEY_PROVIDER_PRIORITY[b.provider] ?? 99)
    );

  return [preferred, ...rest];
}

export function getModelCandidates(provider: string, requestedModel: string): string[] {
  if (provider !== "openrouter") return [requestedModel];

  return [requestedModel, ...OPENROUTER_FALLBACK_MODELS].filter(
    (candidate, index, candidates) => Boolean(candidate) && candidates.indexOf(candidate) === index
  );
}

export function getProviderBaseURL(provider: string): string | undefined {
  return provider === "openrouter"
    ? "https://openrouter.ai/api/v1"
    : provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : provider === "mistral"
          ? "https://api.mistral.ai/v1"
          : undefined;
}

export function supportsOpenAiJsonMode(provider: string, baseURL?: string): boolean {
  return provider === "openai" && (!baseURL || baseURL.includes("api.openai.com"));
}

export function mapExecutionMode(
  mode: ProgramSchema["execution_mode"]
): "autonomous" | "supervised" {
  return mode === "approval_required" ? "supervised" : mode;
}

export function isPromptTooLarge(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes("request too large") ||
    lowerMsg.includes("too large for model") ||
    (lowerMsg.includes("rate_limit_exceeded") && lowerMsg.includes("token")) ||
    lowerMsg.includes("context_length_exceeded") ||
    lowerMsg.includes("maximum context length")
  );
}

export function isKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes("credit balance is too low") ||
    lowerMsg.includes("insufficient credits") ||
    lowerMsg.includes("exceeded your current quota") ||
    lowerMsg.includes("insufficient_quota") ||
    lowerMsg.includes("you've exceeded") ||
    lowerMsg.includes("billing hard limit") ||
    lowerMsg.includes("invalid api key") ||
    lowerMsg.includes("invalid_api_key") ||
    lowerMsg.includes("incorrect api key") ||
    lowerMsg.includes("authentication_error") ||
    lowerMsg.includes("you didn't provide an api key") ||
    lowerMsg.includes("no api key provided") ||
    lowerMsg.includes("does not exist or you do not have access") ||
    lowerMsg.includes("you do not have access to the model")
  );
}

export function isRetryableModelError(err: unknown): boolean {
  if (isPromptTooLarge(err) || isKeyError(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const lowerMsg = msg.toLowerCase();
  return (
    msg.includes("524") ||
    msg.includes("529") ||
    lowerMsg.includes("provider returned error") ||
    lowerMsg.includes("no endpoints found") ||
    lowerMsg.includes("temporarily unavailable") ||
    lowerMsg.includes("overloaded") ||
    lowerMsg.includes("rate-limited") ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("rate_limit_exceeded") ||
    (lowerMsg.includes("model") && lowerMsg.includes("not found")) ||
    lowerMsg.includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT")
  );
}
