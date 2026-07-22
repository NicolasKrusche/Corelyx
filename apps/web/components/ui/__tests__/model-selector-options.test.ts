import { describe, expect, it } from 'vitest'

import {
  FEATURED_MODEL_IDS,
  getVisibleModelSelectorOptions,
} from '../model-selector-options'

const featuredModels = FEATURED_MODEL_IDS.map((id) => ({
  id,
  label: id,
  marker: `featured:${id}`,
}))

const otherModels = [
  {
    id: 'moonshotai/kimi-k3',
    label: 'MoonshotAI: Kimi K3',
    marker: 'search-only:kimi',
  },
  {
    id: 'some-provider/special-model',
    label: 'A Distinct Display Name',
    marker: 'search-only:special',
  },
]

describe('model selector options', () => {
  it('shows only the ten featured models when there is no search', () => {
    const visible = getVisibleModelSelectorOptions(
      [...otherModels, ...featuredModels].reverse(),
      ''
    )

    expect(visible.map((model) => model.id)).toEqual(FEATURED_MODEL_IDS)
    expect(visible).toHaveLength(10)
  })

  it('searches the complete catalog by label or provider/model id', () => {
    const catalog = [...featuredModels, ...otherModels]

    expect(getVisibleModelSelectorOptions(catalog, 'moonshot').map((model) => model.id))
      .toEqual(['moonshotai/kimi-k3'])
    expect(getVisibleModelSelectorOptions(catalog, 'distinct display').map((model) => model.id))
      .toEqual(['some-provider/special-model'])
  })

  it('omits featured models that are not in the available catalog', () => {
    expect(getVisibleModelSelectorOptions(featuredModels.slice(0, 3), ''))
      .toEqual(featuredModels.slice(0, 3))
  })
})
