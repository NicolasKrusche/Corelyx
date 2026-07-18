import type { ProgramSchema } from "@flowos/schema";
import { z } from "zod";
import {
  AGENT_PLATFORM_DEFAULT_MODEL,
  PLATFORM_DEFAULT_MODEL,
  isFreeOpenRouterModel,
} from "@/lib/genesis/platform-models";

export {
  AGENT_PLATFORM_DEFAULT_MODEL,
  PLATFORM_DEFAULT_MODEL,
  getAllowedPlatformModels,
  getPlatformModelTier,
  isFreeOpenRouterModel,
  isPlatformModelAllowed,
  type PlatformModelOption,
  type PlatformModelTier,
} from "@/lib/genesis/platform-models";

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
  // Genesis V2 opt-in (dev-gated): live connection introspection, patch-based
  // refinement, and clarifying questions. The server only honors this for users
  // with technical access; a non-dev request is silently treated as V1.
  genesis_v2: z.boolean().optional(),
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
// The live platform catalog is loaded from OpenRouter by openrouter-models.ts.
// Free users receive only OpenRouter's free IDs; every paid plan can use the
// complete paid catalog and is billed through platform credits.
// ─── OpenRouter fallback chain ────────────────────────────────────────────────

// OpenRouter models tried, in order, when the requested model fails. Used
// for every OpenRouter-routed call regardless of tier (a premium user's
// Sonnet call falls back through this chain too), so it must actually be
// reliable — not just cheap. The ":free"-suffixed slugs previously here
// (openai/gpt-oss-120b:free, qwen/qwen3-coder:free,
// meta-llama/llama-3.3-70b-instruct:free) were dropped after proving
// unreliable in practice: each is served by a single or small pool of
// upstream providers with their own rate limits, and live endpoint checks
// showed one at 0% uptime and another single-provider-throttled. The
// non-free gpt-oss-120b slug is load-balanced across ~20 providers and costs
// a fraction of a cent — a genuinely reliable fallback, not just a cheap one.
export const OPENROUTER_FALLBACK_MODELS = ["openai/gpt-oss-120b"] as const;
export const OPENROUTER_FREE_FALLBACK_MODELS = [PLATFORM_DEFAULT_MODEL] as const;

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
  openrouter: "openai/gpt-oss-120b",
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

  // Local/testing escape hatch: with GENESIS_DISABLE_MODEL_FALLBACKS=true, try
  // only the requested model and fail fast, instead of grinding through the free
  // fallback chain (each free model can take ~30s to time out when rate-limited).
  if (process.env.GENESIS_DISABLE_MODEL_FALLBACKS === "true") {
    return [requestedModel];
  }

  const fallbacks = isFreeOpenRouterModel(requestedModel)
    ? OPENROUTER_FREE_FALLBACK_MODELS
    : OPENROUTER_FALLBACK_MODELS;

  return [requestedModel, ...fallbacks].filter(
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
