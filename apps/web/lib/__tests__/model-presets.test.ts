import { describe, expect, it } from "vitest";

import { MODEL_PRESETS, getDefaultModelForProvider } from "../model-presets";

describe("model presets", () => {
  it("uses current OpenRouter model IDs", () => {
    expect(MODEL_PRESETS.openrouter).toEqual([
      "nvidia/nemotron-3-super-120b-a12b:free",
      "mistralai/mistral-small-3.2-24b-instruct",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-4o-mini",
    ]);

    expect(MODEL_PRESETS.openrouter).not.toContain("mistralai/mistral-7b-instruct:free");
    expect(MODEL_PRESETS.openrouter).not.toContain("google/gemini-flash-1.5-8b");
    expect(MODEL_PRESETS.openrouter).not.toContain("anthropic/claude-haiku-4-5-20251001");
  });

  it("returns the first preset as the provider default", () => {
    expect(getDefaultModelForProvider("openrouter")).toBe("nvidia/nemotron-3-super-120b-a12b:free");
    expect(getDefaultModelForProvider("missing")).toBeNull();
  });
});
