// VOICEVOX の音声パラメータ。main プロセス（audio_query への適用）と
// renderer（設定画面のスライダー・既定値）の両方から使うので CJS で書く。
//
// 既定は「やや早口で淡々と」（利用者指定 2026-09-05）。VOICEVOX 本体の
// スライダーと同じ範囲に揃え、本体で慣れた感覚のまま調整できるようにする。
const VOICEVOX_PARAMS = {
  speed: { query: 'speedScale', min: 0.5, max: 2, step: 0.05, def: 1.2 },
  pitch: { query: 'pitchScale', min: -0.15, max: 0.15, step: 0.01, def: 0 },
  intonation: {
    query: 'intonationScale',
    min: 0,
    max: 2,
    step: 0.05,
    def: 0.6
  },
  volume: { query: 'volumeScale', min: 0, max: 2, step: 0.05, def: 1 },
  pauseScale: { query: 'pauseLengthScale', min: 0, max: 2, step: 0.05, def: 1 },
  prePause: {
    query: 'prePhonemeLength',
    min: 0,
    max: 1.5,
    step: 0.05,
    def: 0.1
  },
  postPause: {
    query: 'postPhonemeLength',
    min: 0,
    max: 1.5,
    step: 0.05,
    def: 0.1
  }
}

const PARAM_KEYS = Object.keys(VOICEVOX_PARAMS)

function defaultVoicevoxParams() {
  const out = {}
  PARAM_KEYS.forEach(k => {
    out[k] = VOICEVOX_PARAMS[k].def
  })
  return out
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

/**
 * 設定から来た値を範囲内の数値に揃える。数値でない・欠けている項目は既定。
 * 範囲外は端に寄せる（古い設定や手編集でエンジンが 422 を返すのを防ぐ）。
 */
function normalizeVoicevoxParams(src) {
  const out = defaultVoicevoxParams()
  if (!src || typeof src !== 'object') return out
  PARAM_KEYS.forEach(k => {
    const v = Number(src[k])
    if (src[k] === '' || src[k] == null || Number.isNaN(v)) return
    const spec = VOICEVOX_PARAMS[k]
    out[k] = clamp(v, spec.min, spec.max)
  })
  return out
}

/**
 * /audio_query の結果に設定値を乗せる。元のオブジェクトは変更しない。
 * @param {object} query AudioQuery
 * @param {object} params normalizeVoicevoxParams の戻り
 * @param {number} [speedMultiplier] 再生プレーヤーの倍速（設定の話速に掛ける）
 */
function applyVoicevoxParams(query, params, speedMultiplier) {
  const p = normalizeVoicevoxParams(params)
  const next = Object.assign({}, query)
  PARAM_KEYS.forEach(k => {
    next[VOICEVOX_PARAMS[k].query] = p[k]
  })
  const mul = Number(speedMultiplier)
  if (mul && mul > 0) {
    const spec = VOICEVOX_PARAMS.speed
    next.speedScale = clamp(p.speed * mul, spec.min, spec.max)
  }
  return next
}

/**
 * プレーヤーの倍速を掛けた「実際にエンジンへ渡す話速」。
 * 設定の話速が既に速いと上限で頭打ちになり、倍速を上げても変わらなくなるので、
 * UI 側でそれを見せるために返す。
 * @param {number} base 設定の話速
 * @param {number} mul プレーヤーの倍速
 * @returns {{value: number, clamped: boolean}}
 */
function effectiveSpeed(base, mul) {
  const spec = VOICEVOX_PARAMS.speed
  const raw = (Number(base) || spec.def) * (Number(mul) || 1)
  const value = clamp(raw, spec.min, spec.max)
  return { value, clamped: Math.abs(raw - value) > 0.001 }
}

// renderer と main の版ずれ検出。renderer だけ再ビルドして main が古いままだと、
// パラメータが黙って無視される（実際に起きた）。main は応答にこの値を載せ、
// renderer は一致しなければ「再起動が必要」と出す
const TTS_IPC_VERSION = 2

module.exports = {
  TTS_IPC_VERSION,
  effectiveSpeed,
  VOICEVOX_PARAMS,
  PARAM_KEYS,
  defaultVoicevoxParams,
  normalizeVoicevoxParams,
  applyVoicevoxParams
}
