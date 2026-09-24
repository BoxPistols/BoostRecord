/**
 * @fileoverview 料金の概算（browser/main/lib/aiModels）のテスト
 */
import { estimateCostUsd, MODEL_PRICING } from 'browser/main/lib/aiModels'

test('単価のあるモデルは、キャッシュ済みの入力を安い単価で数える', () => {
  // gpt-6-luna: 入力0.1 / キャッシュ済み0.01 / 出力0.5（100万トークンあたり）
  const cost = estimateCostUsd('gpt-6-luna', {
    inputTokens: 1000000,
    cachedInputTokens: 200000,
    outputTokens: 100000
  })
  expect(cost).toBeCloseTo(0.8 * 0.1 + 0.2 * 0.01 + 0.1 * 0.5, 10)
})

test('単価を載せていないモデルと使用量なしはnull', () => {
  expect(
    estimateCostUsd('example-model', { inputTokens: 1, outputTokens: 1 })
  ).toBe(null)
  expect(estimateCostUsd('gpt-6-luna', null)).toBe(null)
})

test('単価表の値はすべて数値', () => {
  Object.keys(MODEL_PRICING).forEach(model => {
    const p = MODEL_PRICING[model]
    expect(typeof p.input).toBe('number')
    expect(typeof p.output).toBe('number')
  })
})
