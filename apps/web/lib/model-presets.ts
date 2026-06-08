export const MODEL_PRESETS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
  openrouter: [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "mistralai/mistral-small-3.2-24b-instruct",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
    "anthropic/claude-haiku-4.5",
    "openai/gpt-4o-mini",
  ],
  google: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  mistral: ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x22b"],
  cohere: ["command-r-plus", "command-r"],
};

export function getDefaultModelForProvider(provider: string): string | null {
  const presets = MODEL_PRESETS[provider] ?? [];
  return presets.length > 0 ? presets[0] : null;
}
