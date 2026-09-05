// 廃止モデル ID の移行（normalizeAiModels）の単体テスト。
// localStorage に古い ID が残ったままだと AI 呼び出しが失敗し続けるので、
// 「寄せる」「余計なものは触らない」「変更が無ければ同一参照」を固定する。
const {
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  MODEL_NOTES,
  modelLabel,
  normalizeAiModels
} = require('browser/main/lib/aiModels')

describe('MODEL_OPTIONS / DEFAULT_MODELS', () => {
  it('先頭が既定モデル', () => {
    expect(DEFAULT_MODELS.openai).toBe(MODEL_OPTIONS.openai[0])
    expect(DEFAULT_MODELS.gemini).toBe(MODEL_OPTIONS.gemini[0])
    expect(DEFAULT_MODELS.openai).toBe('gpt-5.6-luna')
  })

  it('注記は提供中のモデルにだけ付く（消したモデルの注記が残らない）', () => {
    Object.keys(MODEL_NOTES).forEach(model => {
      const all = [].concat(MODEL_OPTIONS.openai, MODEL_OPTIONS.gemini)
      expect(all).toContain(model)
    })
  })
})

describe('modelLabel', () => {
  it('既定と注記をまとめて括弧で添える', () => {
    expect(modelLabel('gpt-5.6-luna', true)).toBe(
      'gpt-5.6-luna （既定・無料/回数制限あり）'
    )
  })

  it('注記が無ければ既定表記だけ', () => {
    expect(modelLabel('gemini-3.5-flash-lite', true)).toBe(
      'gemini-3.5-flash-lite （既定）'
    )
  })

  it('既定でも注記でもなければ ID だけ（括弧を出さない）', () => {
    expect(modelLabel('gpt-5.6-sol', false)).toBe('gpt-5.6-sol')
    // 設定に残った一覧外の ID もそのまま出せる
    expect(modelLabel('gpt-5-mini', false)).toBe('gpt-5-mini')
  })
})

describe('normalizeAiModels', () => {
  it('一覧に無い旧 ID を既定へ寄せる', () => {
    const next = normalizeAiModels({
      provider: 'openai',
      openai: { apiKey: 'sk-x', model: 'gpt-5-mini' },
      gemini: { apiKey: '', model: 'gemini-3.8-flash' }
    })
    expect(next.openai.model).toBe(DEFAULT_MODELS.openai)
  })

  it('apiKey と provider は触らない', () => {
    const next = normalizeAiModels({
      provider: 'gemini',
      openai: { apiKey: 'sk-keepme', model: 'gpt-5.4-nano' },
      gemini: { apiKey: 'AIza-keepme', model: 'gemini-1.0-pro' }
    })
    expect(next.provider).toBe('gemini')
    expect(next.openai.apiKey).toBe('sk-keepme')
    expect(next.gemini.apiKey).toBe('AIza-keepme')
    expect(next.gemini.model).toBe(DEFAULT_MODELS.gemini)
  })

  it('空文字・未設定も既定で埋める（未設定のまま残さない）', () => {
    const next = normalizeAiModels({
      openai: { apiKey: '', model: '' },
      gemini: { apiKey: '' }
    })
    expect(next.openai.model).toBe(DEFAULT_MODELS.openai)
    expect(next.gemini.model).toBe(DEFAULT_MODELS.gemini)
  })

  it('provider 設定ごと壊れていても既定で作り直す', () => {
    const next = normalizeAiModels({ provider: 'openai', openai: null })
    expect(next.openai).toEqual({ apiKey: '', model: DEFAULT_MODELS.openai })
    expect(next.gemini).toEqual({ apiKey: '', model: DEFAULT_MODELS.gemini })
  })

  it('提供中の ID なら同一参照を返す（不要な保存を避けるため）', () => {
    const ai = {
      provider: 'openai',
      openai: { apiKey: 'sk-x', model: 'gpt-5.6-sol' },
      gemini: { apiKey: '', model: 'gemini-3.5-flash-lite' }
    }
    expect(normalizeAiModels(ai)).toBe(ai)
  })

  it('ai 自体が無い場合はそのまま返す', () => {
    expect(normalizeAiModels(undefined)).toBeUndefined()
    expect(normalizeAiModels(null)).toBeNull()
  })
})
