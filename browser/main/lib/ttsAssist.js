// 読み上げ（TTS）の renderer 側ラッパー。
//
// speakText(text)  – 設定のエンジンで読み上げる
// stopSpeech()     – 再生中の音声を止める
//
// エンジンは 2 つ。
//   browser  : OS 内蔵の音声合成（Web Speech API）。追加インストール不要で、
//              既定はこちら。何も用意しなくても読み上げが動く状態にする
//   voicevox : ローカルで VOICEVOX エンジンを起動しておく必要がある。
//              起動していなければその旨を返す
const { ipcRenderer } = require('electron')

export const ENGINE_BROWSER = 'browser'
export const ENGINE_VOICEVOX = 'voicevox'
export const DEFAULT_TTS_PORT = 50021
export const DEFAULT_TTS_SPEAKER = 1

let currentAudio = null
let currentObjectUrl = null

function getSynth() {
  return typeof window !== 'undefined' && window.speechSynthesis
    ? window.speechSynthesis
    : null
}

export function stopSpeech() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
  const synth = getSynth()
  if (synth) synth.cancel()
}

/**
 * 設定から読み上げの設定を取り出す。既定値はここ 1 箇所に置く。
 */
export function getTtsConfig() {
  // Lazy require avoids loading electron-config at module init (breaks Jest).
  const ConfigManager = require('browser/main/lib/ConfigManager').default
  // ConfigManager が公開しているのは get()。以前は存在しない getConfig() を
  // 呼んでいたので、エンジンの有無に関係なく読み上げは毎回 TypeError で
  // 落ちていた
  const config = ConfigManager.get()
  const tts = (config && config.tts) || {}
  return {
    engine: tts.engine === ENGINE_VOICEVOX ? ENGINE_VOICEVOX : ENGINE_BROWSER,
    port: tts.port || DEFAULT_TTS_PORT,
    speakerId: tts.speakerId != null ? tts.speakerId : DEFAULT_TTS_SPEAKER,
    rate: tts.rate || 1,
    voiceURI: tts.voiceURI || ''
  }
}

/**
 * OS 内蔵の音声合成で読み上げる。声は日本語のものを優先して選ぶ。
 */
function speakWithBrowser(text, cfg) {
  const synth = getSynth()
  if (!synth) {
    return Promise.reject(new Error('この環境では OS の音声合成が使えません。'))
  }
  return new Promise((resolve, reject) => {
    const utterance = new window.SpeechSynthesisUtterance(text)
    utterance.rate = cfg.rate

    const voices = synth.getVoices() || []
    const chosen =
      voices.find(v => v.voiceURI === cfg.voiceURI) ||
      voices.find(v => /^ja/i.test(v.lang))
    if (chosen) {
      utterance.voice = chosen
      // 選んだ声と違う言語を指定すると、実装によっては指定言語の声に
      // 差し替えられて選択が効かない
      utterance.lang = chosen.lang
    } else {
      utterance.lang = 'ja-JP'
    }

    utterance.onend = () => resolve()
    utterance.onerror = e => {
      // 停止操作による中断はエラーとして出さない
      if (e && (e.error === 'canceled' || e.error === 'interrupted')) {
        resolve()
        return
      }
      reject(new Error('読み上げに失敗しました。'))
    }
    synth.speak(utterance)
  })
}

async function speakWithVoicevox(text, cfg) {
  const result = await ipcRenderer.invoke('tts:speak', {
    text,
    speakerId: cfg.speakerId,
    port: cfg.port
  })
  if (!result.ok) {
    const isOffline = /ECONNREFUSED|ECONNRESET/.test(result.reason || '')
    throw new Error(
      isOffline
        ? `VOICEVOX エンジンが起動していません。\nVOICEVOX を起動してから、もう一度お試しください（http://localhost:${cfg.port}）。\nOS 内蔵の音声で読み上げる場合は、設定 > AI で読み上げエンジンを「OS 内蔵の音声」に変えてください。`
        : result.reason || '読み上げに失敗しました。'
    )
  }

  const blob = new Blob([result.wav], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  currentObjectUrl = url

  const audio = new Audio(url)
  currentAudio = audio
  audio.onended = () => {
    stopSpeech()
  }
  await audio.play()
}

/**
 * 設定を明示して読み上げる。設定画面の試聴は保存前の値で試せる必要があるので、
 * 保存済みの設定を読む speakText() とは別に用意する。
 *
 * @param {string} text
 * @param {object} overrides getTtsConfig() の戻りに重ねる値
 */
export async function speakTextWith(text, overrides) {
  stopSpeech()
  const cfg = Object.assign({}, getTtsConfig(), overrides || {})
  if (cfg.engine === ENGINE_VOICEVOX) return speakWithVoicevox(text, cfg)
  return speakWithBrowser(text, cfg)
}

export async function speakText(text) {
  return speakTextWith(text, null)
}

/**
 * VOICEVOX エンジンに繋がるかを確かめる。設定画面の「接続テスト」から呼ぶ。
 * 保存前の値で試せるよう、port は引数で受ける。
 */
export function testVoicevox(port) {
  return ipcRenderer
    .invoke('tts:ping', { port: port || DEFAULT_TTS_PORT })
    .catch(err => ({ ok: false, reason: (err && err.message) || 'IPC_FAILED' }))
    .then(res => {
      if (res && res.ok) {
        return { ok: true, message: `VOICEVOX ${res.version} に接続しました` }
      }
      const reason = (res && res.reason) || ''
      return {
        ok: false,
        message: /ECONNREFUSED|ECONNRESET/.test(reason)
          ? 'VOICEVOX エンジンに繋がりません。VOICEVOX を起動してください。'
          : reason || '接続できませんでした'
      }
    })
}

/**
 * OS 内蔵の音声一覧。日本語の声を先に並べる。
 */
export function listBrowserVoices() {
  const synth = getSynth()
  if (!synth) return []
  const voices = synth.getVoices() || []
  const ja = voices.filter(v => /^ja/i.test(v.lang))
  const rest = voices.filter(v => !/^ja/i.test(v.lang))
  return ja.concat(rest)
}
