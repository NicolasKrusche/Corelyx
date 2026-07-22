export type ModelSelectorOption = {
  id: string
  label: string
}

/**
 * Models shown before the user searches. The full catalog remains available
 * through search, so this list can stay focused on a useful cross-provider mix.
 */
export const FEATURED_MODEL_IDS = [
  'openrouter/free',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-4o-mini',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.5-flash',
  'x-ai/grok-4.5',
  'deepseek/deepseek-v4-pro',
] as const

export function getVisibleModelSelectorOptions<T extends ModelSelectorOption>(
  models: T[],
  query: string
): T[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery) {
    return models.filter((model) =>
      `${model.label} ${model.id}`.toLowerCase().includes(normalizedQuery)
    )
  }

  const modelsById = new Map(models.map((model) => [model.id, model]))
  return FEATURED_MODEL_IDS.flatMap((id) => {
    const model = modelsById.get(id)
    return model ? [model] : []
  })
}
