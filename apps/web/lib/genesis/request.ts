import type { ProgramSchema } from "@flowos/schema";

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

export const OPENROUTER_FALLBACK_MODELS = [
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
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
  openrouter: "qwen/qwen3-coder:free",
};

export const GENESIS_MAX_TOKENS = 8192;
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
