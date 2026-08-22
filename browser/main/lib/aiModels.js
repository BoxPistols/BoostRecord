// Single source of truth for the selectable AI models.
//
// Deliberately import-free: ConfigManager needs it, and aiAssist already
// imports ConfigManager — putting the list in aiAssist would make that a cycle.
//
// First entry per provider is the default (AITab labels it 「既定」).
// Model IDs move fast — refreshed 2026-08.
//   gpt-5.6-luna : default. Free, but rate-limited.
//   gpt-5.6-sol  : the other gpt-5.6 model on offer.
// Left out on purpose: the gpt-5.4 family (retired), gpt-5.1-codex-mini (paid,
// so never cheaper than the free default), text-embedding-3-small (embeddings)
// and gpt-audio-1.5 (audio) — the latter two can't serve chat completions.
export const MODEL_OPTIONS = {
  openai: ['gpt-5.6-luna', 'gpt-5.6-sol'],
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
}

export const DEFAULT_MODELS = {
  openai: MODEL_OPTIONS.openai[0],
  gemini: MODEL_OPTIONS.gemini[0]
}

// モデル選択に添える短い注記（料金・制限）。選ぶ前に分かる必要がある情報だけ。
// 載っていないモデルは注記なしで出す（推測で書かない）
export const MODEL_NOTES = {
  'gpt-5.6-luna': '無料/回数制限あり'
}

/**
 * モデル選択に出す表示名。`gpt-5.6-luna （既定・無料/回数制限あり）` のように、
 * 選ぶ前に要る情報だけ括弧で添える。注記が無いモデルは ID だけを返す。
 *
 * @param {string} model モデル ID
 * @param {boolean} isDefault 一覧の先頭（＝既定）かどうか
 * @returns {string}
 */
export function modelLabel(model, isDefault) {
  const notes = []
  if (isDefault) notes.push('既定')
  if (MODEL_NOTES[model]) notes.push(MODEL_NOTES[model])
  return notes.length ? `${model} （${notes.join('・')}）` : model
}

function isPlainObject(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o)
}

/**
 * 保存済みの ai 設定を、いま提供しているモデルへ寄せ直す。
 *
 * 廃止した ID（gpt-5-mini 等）が localStorage に残っていると API 呼び出しが
 * 失敗し続けるので、MODEL_OPTIONS に無い ID は provider の既定へ置き換える。
 * apiKey など他のキーは触らない。
 *
 * 変更が無ければ **引数をそのまま返す**（呼び出し側が同一性で「移行したか」を
 * 判定して、不要な保存を避けられるようにするため）。
 *
 * @param {object} ai config.ai
 * @returns {object} 正規化済みの ai（未変更なら引数と同一参照）
 */
export function normalizeAiModels(ai) {
  if (!isPlainObject(ai)) return ai

  let changed = false
  const next = Object.assign({}, ai)

  Object.keys(MODEL_OPTIONS).forEach(provider => {
    const cfg = next[provider]
    // 壊れた/欠けた provider 設定は既定で作り直す。「不正を捨てるだけ」で
    // 終えると model 未設定のまま残り、次の呼び出しがそのまま失敗する
    if (!isPlainObject(cfg)) {
      next[provider] = { apiKey: '', model: DEFAULT_MODELS[provider] }
      changed = true
      return
    }
    if (MODEL_OPTIONS[provider].indexOf(cfg.model) !== -1) return
    next[provider] = Object.assign({}, cfg, {
      model: DEFAULT_MODELS[provider]
    })
    changed = true
  })

  return changed ? next : ai
}
