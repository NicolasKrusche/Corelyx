import { describe, expect, it } from "vitest";

import {
  PLATFORM_DEFAULT_MODEL,
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
  },
  {
    id: "vendor/free-model:free",
    name: "Vendor: Free Model (free)",
    context_length: 64_000,
  },
  {
    id: "vendor/per-request-model",
    name: "Vendor: Per Request",
  },
  {
    id: "openrouter/free",
    name: "Free Models Router",
    context_length: 200_000,
  },
  {
    id: PLATFORM_DEFAULT_MODEL,
    name: "Platform Default",
    context_length: 128_000,
  },
]);

describe("OpenRouter platform model catalog", () => {
  it("excludes OpenRouter's own free-tier models entirely — they proved unreliable", () => {
    expect(catalog.map((model) => model.id)).not.toContain("openrouter/free");
    expect(catalog.map((model) => model.id)).not.toContain("vendor/free-model:free");
    expect(catalog.map((model) => model.id)).toEqual(
      expect.arrayContaining(["vendor/paid-model", "vendor/per-request-model", PLATFORM_DEFAULT_MODEL])
    );
  });

  it("sorts the remaining catalog alphabetically", () => {
    const labels = catalog.map((model) => model.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });

  it("recognizes only documented free model IDs", () => {
    expect(isFreeOpenRouterModel("openrouter/free")).toBe(true);
    expect(isFreeOpenRouterModel("vendor/free-model:free")).toBe(true);
    expect(isFreeOpenRouterModel("vendor/per-request-model")).toBe(false);
  });

  it("restricts Free plan to only the platform default model; every paid plan gets the full catalog", () => {
    expect(getAllowedPlatformModels("free", catalog).map((model) => model.id)).toEqual([
      PLATFORM_DEFAULT_MODEL,
    ]);
    expect(getAllowedPlatformModels("standard", catalog)).toEqual(catalog);
    expect(getAllowedPlatformModels("premium", catalog)).toEqual(catalog);
    expect(isPlatformModelAllowed("any/new-openrouter-model", "standard")).toBe(true);
    expect(isPlatformModelAllowed("any/new-openrouter-model", "free")).toBe(false);
  });

  it("shows only context length — never a free/paid label or per-token price", () => {
    expect(catalog.find((model) => model.id === "vendor/paid-model")?.sublabel)
      .toBe("128K context");
    expect(catalog.find((model) => model.id === "vendor/per-request-model")?.sublabel)
      .toBe("");
  });
});
