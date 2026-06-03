import { describe, expect, it } from "vitest";

import {
  GenesisRequestSchema,
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
    expect(getModelCandidates("openrouter", "qwen/qwen3-coder:free")).toEqual([
      "qwen/qwen3-coder:free",
      "openai/gpt-oss-120b:free",
      "meta-llama/llama-3.3-70b-instruct:free",
    ]);
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
