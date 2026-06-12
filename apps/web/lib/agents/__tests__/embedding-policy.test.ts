import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { embeddingsAllowedForWorkspaces } from "@/lib/agents/embedding-policy";

function mockService(rows: Array<{ id: string; compliance_mode: string | null }> | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error }),
      }),
    }),
  };
}

describe("embeddingsAllowedForWorkspaces", () => {
  const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_EU_RESIDENCY: process.env.OPENAI_EU_RESIDENCY };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.OPENAI_EU_RESIDENCY;
  });

  afterEach(() => {
    if (env.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (env.OPENAI_EU_RESIDENCY === undefined) delete process.env.OPENAI_EU_RESIDENCY;
    else process.env.OPENAI_EU_RESIDENCY = env.OPENAI_EU_RESIDENCY;
  });

  it("allows standard workspaces", async () => {
    const service = mockService([{ id: "a", compliance_mode: "standard" }]);
    expect(await embeddingsAllowedForWorkspaces(service, ["a"])).toBe(true);
  });

  it("blocks when any workspace is eu_only", async () => {
    const service = mockService([
      { id: "a", compliance_mode: "standard" },
      { id: "b", compliance_mode: "eu_only" },
    ]);
    expect(await embeddingsAllowedForWorkspaces(service, ["a", "b"])).toBe(false);
  });

  it("allows eu_only workspaces when the platform project is EU-resident", async () => {
    process.env.OPENAI_EU_RESIDENCY = "true";
    const service = mockService([{ id: "a", compliance_mode: "eu_only" }]);
    expect(await embeddingsAllowedForWorkspaces(service, ["a"])).toBe(true);
  });

  it("blocks when no embeddings key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const service = mockService([{ id: "a", compliance_mode: "standard" }]);
    expect(await embeddingsAllowedForWorkspaces(service, ["a"])).toBe(false);
  });

  it("fails closed when compliance modes cannot be read", async () => {
    expect(await embeddingsAllowedForWorkspaces(mockService(null, { message: "boom" }), ["a"])).toBe(false);
    // Missing rows (e.g. deleted workspace) also block.
    expect(await embeddingsAllowedForWorkspaces(mockService([]), ["a"])).toBe(false);
  });

  it("blocks for an empty workspace list", async () => {
    expect(await embeddingsAllowedForWorkspaces(mockService([]), [])).toBe(false);
  });
});
