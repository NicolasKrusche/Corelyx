import { describe, expect, it } from "vitest";

import {
  GenesisRequestSchema,
  OPENROUTER_FALLBACK_MODELS,
  PLATFORM_MODEL_CATALOG,
  getMissingConnectionIds,
  getModelCandidates,
  sortApiKeyFallbacks,
  toGenesisConnectionList,
  toProgramConnectionLinks,
  uniqueRequestedConnectionIds,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "../request";

describe("genesis request helpers", () => {
  const programId = "c336bde8-7f6d-4cc2-843f-cbe5cdcc7899";

  const connections: GenesisConnectionRow[] = [
    { id: "conn-1", name: "Gmail", provider: "gmail", scopes: ["gmail.readonly"] },
    { id: "conn-2", name: "Slack", provider: "slack", scopes: null },
  ];

  it("dedupes requested connection IDs while preserving order", () => {
    expect(uniqueRequestedConnectionIds(["conn-2", "conn-1", "conn-2"])).toEqual([
      "conn-2",
      "conn-1",
    ]);
  });

  it("reports selected connection IDs that were not verified", () => {
    expect(getMissingConnectionIds(["conn-1", "other-user-conn"], connections)).toEqual([
      "other-user-conn",
    ]);
  });

  it("builds prompt-safe connection data and link rows from verified connections only", () => {
    expect(toGenesisConnectionList(connections)).toEqual([
      { name: "Gmail", type: "gmail", scopes: ["gmail.readonly"] },
      { name: "Slack", type: "slack", scopes: [] },
    ]);

    expect(toProgramConnectionLinks("program-1", connections)).toEqual([
      { program_id: "program-1", connection_id: "conn-1" },
      { program_id: "program-1", connection_id: "conn-2" },
    ]);
  });

  it("requires the requested API key before offering fallbacks", () => {
    const keys: GenesisApiKeyRow[] = [
      { id: "openrouter", provider: "openrouter", vault_secret_id: "vault-openrouter" },
      { id: "anthropic", provider: "anthropic", vault_secret_id: "vault-anthropic" },
      { id: "groq", provider: "groq", vault_secret_id: "vault-groq" },
    ];

    expect(sortApiKeyFallbacks("openrouter", keys).map((key) => key.id)).toEqual([
      "openrouter",
      "anthropic",
      "groq",
    ]);
    expect(sortApiKeyFallbacks("deleted-key", keys)).toEqual([]);
  });

  it("adds OpenRouter fallback models without duplicates", () => {
    expect(getModelCandidates("openai", "gpt-4o")).toEqual(["gpt-4o"]);
    expect(getModelCandidates("openrouter", "anthropic/claude-sonnet-4.6")).toEqual([
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-oss-120b",
    ]);
    // Requesting the fallback model itself must not duplicate it.
    expect(getModelCandidates("openrouter", "openai/gpt-oss-120b")).toEqual([
      "openai/gpt-oss-120b",
    ]);
  });

  it("uses current OpenRouter slugs for platform model options", () => {
    const ids = PLATFORM_MODEL_CATALOG.map((model) => model.id);
    expect(ids).toContain("anthropic/claude-sonnet-4.6");
    expect(ids).not.toContain("anthropic/claude-sonnet-4-6");
    // The fallback chain must never point at an OpenRouter ":free" slug —
    // those are served by a small pool of upstream providers with their own
    // rate limits and proved unreliable in practice (see OPENROUTER_FALLBACK_MODELS).
    expect(OPENROUTER_FALLBACK_MODELS.every((id) => !id.endsWith(":free"))).toBe(true);
    expect(ids.every((id) => !id.endsWith(":free"))).toBe(true);
  });

  it("keeps the minimum description length for new workflow generation", () => {
    expect(
      GenesisRequestSchema.safeParse({
        description: "Spam",
        connection_ids: [],
        use_platform_key: true,
      }).success
    ).toBe(false);
  });

  it("accepts a one-time agent generation request", () => {
    const result = GenesisRequestSchema.safeParse({
      description: "Reconcile last quarter's invoices across Stripe and Sheets",
      connection_ids: [],
      use_platform_key: true,
      program_type: "agent",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.program_type).toBe("agent");
  });

  it("defaults to a workflow when program_type is omitted", () => {
    const result = GenesisRequestSchema.safeParse({
      description: "Send a Slack message every morning at 9am",
      connection_ids: [],
      use_platform_key: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.program_type).toBeUndefined();
  });

  it("rejects an unknown program_type", () => {
    const result = GenesisRequestSchema.safeParse({
      description: "Do something undefined and strange to my account",
      connection_ids: [],
      use_platform_key: true,
      program_type: "daemon",
    });
    expect(result.success).toBe(false);
  });

  it("allows AI edits for workflows with short names", () => {
    expect(
      GenesisRequestSchema.safeParse({
        description: "Spam",
        connection_ids: [],
        use_platform_key: true,
        existing_schema: { program_name: "Spam" },
        refinement: "Replace the current step with an AI spam check.",
        existing_program_id: programId,
      }).success
    ).toBe(true);
  });
});
