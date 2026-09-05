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

// macOS 14 以降の日本語の声一覧を模す。アルファベット順だと Eddy（遊び声）が
// 先頭に来るので、「最初の ja の声」を取ると機械音声になる。実測: 2026-09-05
const macVoices = [
  { name: 'Eddy (日本語（日本）)', lang: 'ja-JP', voiceURI: 'eddy' },
  { name: 'Flo (日本語（日本）)', lang: 'ja-JP', voiceURI: 'flo' },
  { name: 'Grandma (日本語（日本）)', lang: 'ja-JP', voiceURI: 'grandma' },
  { name: 'Kyoko', lang: 'ja-JP', voiceURI: 'kyoko' },
  { name: 'Reed (日本語（日本）)', lang: 'ja-JP', voiceURI: 'reed' },
  { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha' }
]

describe('pickBrowserVoice', () => {
  const {
    pickBrowserVoice,
    sortBrowserVoices
  } = require('browser/main/lib/ttsAssist')

  it('設定が無ければ遊び声を飛ばして Kyoko を選ぶ', () => {
    expect(pickBrowserVoice(macVoices, '').voiceURI).toBe('kyoko')
  })

  it('設定で選んだ声があれば順位に関係なくそれを使う', () => {
    expect(pickBrowserVoice(macVoices, 'reed').voiceURI).toBe('reed')
  })

  it('Kyoko が無ければ日本語の実用的な声、それも無ければ遊び声', () => {
    const noKyoko = macVoices.filter(v => v.voiceURI !== 'kyoko')
    const withOren = noKyoko.concat([
      { name: 'O-Ren', lang: 'ja-JP', voiceURI: 'oren' }
    ])
    expect(pickBrowserVoice(withOren, '').voiceURI).toBe('oren')
    expect(pickBrowserVoice(noKyoko, '').voiceURI).toBe('eddy')
  })

  it('日本語の声が 1 つも無ければ null（lang 指定に任せる）', () => {
    expect(pickBrowserVoice([macVoices[5]], '')).toBe(null)
  })

  it('一覧も同じ順で並ぶ。Kyoko → 遊び声 → 他言語', () => {
    expect(sortBrowserVoices(macVoices).map(v => v.voiceURI)).toEqual([
      'kyoko',
      'eddy',
      'flo',
      'grandma',
      'reed',
      'samantha'
    ])
  })
})

describe('speakTextWith の単一再生', () => {
  const electron = require('electron')
  const { TTS_IPC_VERSION } = require('../../lib/tts/params')

  it('合成待ちの間に停止か次の再生が来たら、遅れて届いた結果は鳴らさない', async () => {
    ConfigManager.get.mockReturnValue({
      tts: { engine: 'voicevox', port: 50021, speakerId: 126 }
    })
    const { speakTextWith, stopSpeech } = require('browser/main/lib/ttsAssist')
    // 1 回目の合成は遅く、2 回目は速く返る
    const resolvers = []
    electron.ipcRenderer = {
      invoke: jest.fn(
        () =>
          new Promise(resolve => {
            resolvers.push(resolve)
          })
      )
    }
    const played = []
    global.URL.createObjectURL = () => 'blob:x'
    global.URL.revokeObjectURL = () => {}
    global.Blob = function() {}
    global.Audio = function() {
      const a = {
        play: jest.fn(() => {
          played.push(a)
          return Promise.resolve()
        }),
        pause: jest.fn()
      }
      return a
    }

    const first = speakTextWith('一')
    stopSpeech()
    const second = speakTextWith('二')
    // 2 回目が先に返る
    resolvers[1]({
      ok: true,
      ipcVersion: TTS_IPC_VERSION,
      wav: new Uint8Array(4)
    })
    // 遅れて 1 回目が返る
    resolvers[0]({
      ok: true,
      ipcVersion: TTS_IPC_VERSION,
      wav: new Uint8Array(4)
    })
    // 再生が始まった側は onended で完了する（偽 Audio なので手で鳴らし終える）
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(played.length).toBe(1)
    played[0].onended()
    await Promise.all([first, second])
    expect(played.length).toBe(1)
  })
})

describe('main プロセスの版ずれ検出', () => {
  const electron = require('electron')

  it('ipcVersion を返さない古い main には「再起動が必要」と出す', async () => {
    const {
      testVoicevox,
      STALE_MAIN_MESSAGE
    } = require('browser/main/lib/ttsAssist')
    electron.ipcRenderer = {
      invoke: jest.fn(() => Promise.resolve({ ok: true, version: '0.25.2' }))
    }
    const res = await testVoicevox(50021)
    expect(res.ok).toBe(false)
    expect(res.message).toBe(STALE_MAIN_MESSAGE)
  })

  it('版が合っていれば接続成功', async () => {
    const { TTS_IPC_VERSION } = require('../../lib/tts/params')
    const { testVoicevox } = require('browser/main/lib/ttsAssist')
    electron.ipcRenderer = {
      invoke: jest.fn(() =>
        Promise.resolve({
          ok: true,
          version: '0.25.2',
          ipcVersion: TTS_IPC_VERSION
        })
      )
    }
    const res = await testVoicevox(50021)
    expect(res.ok).toBe(true)
  })
})
