// 読み上げの設定の読み取り。
//
// 以前は存在しない ConfigManager.getConfig() を呼んでいて、エンジンの起動有無に
// 関係なく読み上げが毎回 TypeError で落ちていた。設定の読み取りをここで固定する。
// alias(browser/...) は jest.mock の引数まで書き換わらないので、相対パスで指す
jest.mock('../../browser/main/lib/ConfigManager', () => ({
  default: { get: jest.fn() }
}))

const ConfigManager = require('../../browser/main/lib/ConfigManager').default
const {
  getTtsConfig,
  ENGINE_BROWSER,
  ENGINE_VOICEVOX,
  DEFAULT_TTS_PORT,
  DEFAULT_TTS_SPEAKER
} = require('browser/main/lib/ttsAssist')

describe('getTtsConfig', () => {
  it('設定が無ければ OS 内蔵の音声。追加の用意なしで読み上げられる', () => {
    ConfigManager.get.mockReturnValue({})
    const cfg = getTtsConfig()
    expect(cfg.engine).toBe(ENGINE_BROWSER)
    expect(cfg.port).toBe(DEFAULT_TTS_PORT)
    expect(cfg.speakerId).toBe(DEFAULT_TTS_SPEAKER)
  })

  it('VOICEVOX を選んでいればその設定を返す', () => {
    ConfigManager.get.mockReturnValue({
      tts: { engine: 'voicevox', port: 50022, speakerId: 3 }
    })
    const cfg = getTtsConfig()
    expect(cfg.engine).toBe(ENGINE_VOICEVOX)
    expect(cfg.port).toBe(50022)
    expect(cfg.speakerId).toBe(3)
  })

  it('知らないエンジン名は OS 内蔵の音声に寄せる', () => {
    ConfigManager.get.mockReturnValue({ tts: { engine: 'festival' } })
    expect(getTtsConfig().engine).toBe(ENGINE_BROWSER)
  })

  it('話者 ID の 0 を既定値で潰さない', () => {
    ConfigManager.get.mockReturnValue({ tts: { speakerId: 0 } })
    expect(getTtsConfig().speakerId).toBe(0)
  })

  it('設定が null でも落ちない', () => {
    ConfigManager.get.mockReturnValue(null)
    expect(getTtsConfig().engine).toBe(ENGINE_BROWSER)
  })
})
