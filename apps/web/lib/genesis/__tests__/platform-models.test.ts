import { describe, expect, it } from "vitest";

import {
  getAllowedPlatformModels,
  isFreeOpenRouterModel,
  isPlatformModelAllowed,
  toPlatformModelCatalog,
} from "../platform-models";

const catalog = toPlatformModelCatalog([
  {
    id: "vendor/paid-model",
    name: "Vendor: Paid Model",
    context_length: 128_000,
    pricing: { prompt: "0.000001", completion: "0.000002" },
  },
  {
    id: "vendor/free-model:free",
    name: "Vendor: Free Model (free)",
    context_length: 64_000,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    // Zero token prices alone do not make a per-request or multimodal model a
    // free OpenRouter variant. OpenRouter's documented IDs are authoritative.
    id: "vendor/per-request-model",
    name: "Vendor: Per Request",
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "openrouter/free",
    name: "Free Models Router",
    context_length: 200_000,
    pricing: { prompt: "0", completion: "0" },
  },
]);

describe("OpenRouter platform model catalog", () => {
  it("keeps every valid model returned by OpenRouter", () => {
    expect(catalog.map((model) => model.id)).toEqual([
      "openrouter/free",
      "vendor/free-model:free",
      "vendor/paid-model",
      "vendor/per-request-model",
    ]);
  });

  it("recognizes only documented free model IDs", () => {
    expect(isFreeOpenRouterModel("openrouter/free")).toBe(true);
    expect(isFreeOpenRouterModel("vendor/free-model:free")).toBe(true);
    expect(isFreeOpenRouterModel("vendor/per-request-model")).toBe(false);
  });

  it("gives Free users only free models and every paid plan the full catalog", () => {
    expect(getAllowedPlatformModels("free", catalog).map((model) => model.id)).toEqual([
      "openrouter/free",
      "vendor/free-model:free",
    ]);
    expect(getAllowedPlatformModels("standard", catalog)).toEqual(catalog);
    expect(getAllowedPlatformModels("premium", catalog)).toEqual(catalog);
    expect(isPlatformModelAllowed("any/new-openrouter-model", "standard")).toBe(true);
  });

  it("adds useful pricing and context metadata", () => {
    expect(catalog.find((model) => model.id === "vendor/paid-model")?.sublabel)
      .toBe("Paid · $1/M input · $2/M output · 128K context");
    expect(catalog.find((model) => model.id === "openrouter/free")?.sublabel)
      .toBe("Free · 200K context");
    expect(catalog.find((model) => model.id === "vendor/per-request-model")?.sublabel)
      .toBe("Paid · Usage-based pricing");
  });
});
