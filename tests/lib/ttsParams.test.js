// VOICEVOX パラメータの正規化と audio_query への適用。
// エンジンは範囲外の値に 422 を返すので、境界の扱いをここで固定する
const {
  VOICEVOX_PARAMS,
  defaultVoicevoxParams,
  normalizeVoicevoxParams,
  applyVoicevoxParams
} = require('../../lib/tts/params')

describe('normalizeVoicevoxParams', () => {
  it('既定はやや早口で抑揚控えめ', () => {
    const d = defaultVoicevoxParams()
    expect(d.speed).toBeGreaterThan(1)
    expect(d.intonation).toBeLessThan(1)
    expect(normalizeVoicevoxParams(undefined)).toEqual(d)
  })

  it('文字列の数値を受け、範囲外は端に寄せ、壊れた値は既定に戻す', () => {
    const p = normalizeVoicevoxParams({
      speed: '1.5',
      pitch: 9,
      intonation: 'abc',
      volume: '',
      prePause: -1
    })
    expect(p.speed).toBe(1.5)
    expect(p.pitch).toBe(VOICEVOX_PARAMS.pitch.max)
    expect(p.intonation).toBe(VOICEVOX_PARAMS.intonation.def)
    expect(p.volume).toBe(VOICEVOX_PARAMS.volume.def)
    expect(p.prePause).toBe(0)
  })
})

describe('applyVoicevoxParams', () => {
  const query = {
    accent_phrases: [{ moras: [] }],
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    pauseLengthScale: 1,
    outputSamplingRate: 24000,
    kana: "コンニチワ'"
  }

  it('AudioQuery の該当キーだけを書き換え、他は保つ', () => {
    const out = applyVoicevoxParams(query, { speed: 1.4, intonation: 0.5 })
    expect(out.speedScale).toBe(1.4)
    expect(out.intonationScale).toBe(0.5)
    expect(out.accent_phrases).toBe(query.accent_phrases)
    expect(out.kana).toBe(query.kana)
    expect(query.speedScale).toBe(1)
  })

  it('プレーヤーの倍速は設定の話速に掛け、上限で止まる', () => {
    expect(
      applyVoicevoxParams(query, { speed: 1.2 }, 1.25).speedScale
    ).toBeCloseTo(1.5)
    expect(applyVoicevoxParams(query, { speed: 1.5 }, 2).speedScale).toBe(
      VOICEVOX_PARAMS.speed.max
    )
    expect(applyVoicevoxParams(query, { speed: 1.2 }, 0).speedScale).toBe(1.2)
  })
})
