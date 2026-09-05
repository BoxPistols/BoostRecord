// 読み上げ（TTS）の renderer 側ラッパー。
//
// speakText(text)        – 設定のエンジンで読み上げる（選択範囲・1 行向け）
// stopSpeech()           – 再生中の音声を止める
// preparePlayable(text)  – 合成だけ済ませて再生は呼び手に任せる（プレーヤー用）
//
// エンジンは 2 つ。
//   browser  : OS 内蔵の音声合成（Web Speech API）。追加インストール不要で、
//              既定はこちら。何も用意しなくても読み上げが動く状態にする
//   voicevox : ローカルで VOICEVOX エンジンを起動しておく必要がある。
//              起動していなければその旨を返す
// ipcRenderer は呼ぶ時に引く（テストで差し替えられるように。module 読み込み時に
// 束縛すると jest の electron モックに後から付けた invoke が見えない）
function ipc() {
  return require('electron').ipcRenderer
}
const {
  normalizeVoicevoxParams,
  defaultVoicevoxParams,
  TTS_IPC_VERSION
} = require('../../../lib/tts/params')

export const STALE_MAIN_MESSAGE =
  'アプリの再起動が必要です。読み上げの内部処理が更新されていますが、起動中のアプリはまだ古いままです（画面のリロードでは直りません）。'

// main の応答が期待する版か。古い main は ipcVersion を返さない
function isStaleMain(res) {
  return !!res && res.ok && res.ipcVersion !== TTS_IPC_VERSION
}

export const ENGINE_BROWSER = 'browser'
export const ENGINE_VOICEVOX = 'voicevox'
export const DEFAULT_TTS_PORT = 50021
// 里石ユカ（つぼみ）。lib/tts/ipc.js の DEFAULT_SPEAKER と揃える
export const DEFAULT_TTS_SPEAKER = 126

let currentAudio = null
let currentObjectUrl = null
// プレーヤーなど、別経路で音を出している側を止めるためのフック
const stopHooks = []

function getSynth() {
  return typeof window !== 'undefined' && window.speechSynthesis
    ? window.speechSynthesis
    : null
}

/**
 * stopSpeech() のときに呼ばれる関数を登録する。プレーヤーが自分の再生を
 * 止めるために使う（右クリックの「読み上げ」と二重に鳴らさない）。
 */
export function registerStopHook(fn) {
  if (stopHooks.indexOf(fn) === -1) stopHooks.push(fn)
  return () => {
    const i = stopHooks.indexOf(fn)
    if (i !== -1) stopHooks.splice(i, 1)
  }
}

export function stopSpeech() {
  // 進行中の speakTextWith があれば、その合成結果を無効にする
  speakToken++
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
  stopHooks.slice().forEach(fn => {
    try {
      fn()
    } catch (e) {
      /* 片方の失敗で残りを止め損ねない */
    }
  })
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
    speakerLabel: tts.speakerLabel || '',
    rate: tts.rate || 1,
    voiceURI: tts.voiceURI || '',
    // 前へ / 次へ / シークの単位: 'chunk' | 'paragraph' | 'section'
    skipUnit: tts.skipUnit || 'paragraph',
    // VOICEVOX の音声パラメータ。設定に無い項目は既定で埋める
    params: normalizeVoicevoxParams(tts)
  }
}

export { defaultVoicevoxParams }

// macOS 14 以降は日本語にも「Eddy / Flo / Grandma …」の遊び声が並び、
// 一覧の先頭（アルファベット順で Eddy）を取ると機械音声になる。
// Kyoko を最優先にし、遊び声は他に無いときだけ使う。実測: 2026-09-05
const PREFERRED_JA_VOICES = ['kyoko', 'o-ren', 'otoya', 'hattori']
const NOVELTY_VOICES = [
  'eddy',
  'flo',
  'grandma',
  'grandpa',
  'reed',
  'rocko',
  'sandy',
  'shelley',
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox'
]

function voiceRank(v) {
  const name = (v.name || '').toLowerCase()
  const isJa = /^ja/i.test(v.lang || '')
  if (PREFERRED_JA_VOICES.some(p => name.indexOf(p) === 0)) return 0
  const novelty = NOVELTY_VOICES.some(n => name.indexOf(n) === 0)
  if (isJa && !novelty) return 1
  if (isJa) return 2
  return novelty ? 4 : 3
}

/**
 * 声の一覧を「使うべき順」に並べる。日本語の実用的な声 → 日本語の遊び声 →
 * 他言語。同じ順位の中は元の順序を保つ。
 */
export function sortBrowserVoices(voices) {
  return (voices || [])
    .map((v, i) => ({ v, i, r: voiceRank(v) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.v)
}

/**
 * 読み上げに使う声を決める。設定で選んだ声があればそれ、無ければ
 * sortBrowserVoices() の先頭。日本語の声が 1 つも無ければ null
 */
export function pickBrowserVoice(voices, voiceURI) {
  const list = voices || []
  const explicit = voiceURI && list.find(v => v.voiceURI === voiceURI)
  if (explicit) return explicit
  const sorted = sortBrowserVoices(list)
  const first = sorted[0]
  return first && /^ja/i.test(first.lang || '') ? first : null
}

// getVoices() は起動直後は空で、voiceschanged の後に埋まる。
// 空のまま speak すると OS 既定の声（英語）になるので、少しだけ待つ
function waitForVoices(synth) {
  const now = synth.getVoices() || []
  if (now.length) return Promise.resolve(now)
  return new Promise(resolve => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices() || [])
    }
    synth.addEventListener('voiceschanged', finish)
    setTimeout(finish, 1000)
  })
}

// ---------------------------------------------------------------------------
// Playable: 合成済みの 1 塊。play/pause/resume/stop/setVolume を同じ形で持つ。
// プレーヤーはエンジンの違いを知らずに済む
// ---------------------------------------------------------------------------

/**
 * OS 内蔵の音声合成。合成と再生が分離できないので、play() で utterance を作る。
 * volume は再生開始時に反映する（途中変更は Web Speech API に無い）。
 */
async function prepareBrowser(text, cfg) {
  const synth = getSynth()
  if (!synth) {
    throw new Error('この環境では OS の音声合成が使えません。')
  }
  const voices = await waitForVoices(synth)
  let utterance = null
  let volume = cfg.volume != null ? cfg.volume : 1
  return {
    play(onEnd) {
      utterance = new window.SpeechSynthesisUtterance(text)
      utterance.rate = Math.min(2, Math.max(0.5, cfg.rate || 1))
      utterance.volume = Math.min(1, Math.max(0, volume))
      const chosen = pickBrowserVoice(voices, cfg.voiceURI)
      if (chosen) {
        utterance.voice = chosen
        // 選んだ声と違う言語を指定すると、実装によっては指定言語の声に
        // 差し替えられて選択が効かない
        utterance.lang = chosen.lang
      } else {
        utterance.lang = 'ja-JP'
      }
      return new Promise((resolve, reject) => {
        utterance.onend = () => {
          if (onEnd) onEnd()
          resolve()
        }
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
    },
    pause() {
      synth.pause()
    },
    resume() {
      synth.resume()
    },
    stop() {
      synth.cancel()
    },
    setVolume(v) {
      volume = v
    },
    // OS 内蔵は途中で速度を変えられない（次の塊から効く）
    setRate() {},
    // 実際に使う声の名前（プレーヤーに出す）
    label: (() => {
      const chosen = pickBrowserVoice(voices, cfg.voiceURI)
      return chosen ? chosen.name : ''
    })()
  }
}

function voicevoxError(result, cfg) {
  const reason = result.reason || ''
  const isOffline = /ECONNREFUSED|ECONNRESET|timeout/.test(reason)
  return new Error(
    isOffline
      ? `VOICEVOX エンジンが起動していません。\nVOICEVOX を起動してから、もう一度お試しください（http://127.0.0.1:${cfg.port}）。\nOS 内蔵の音声で読み上げる場合は、設定 > AI で読み上げエンジンを「OS 内蔵の音声」に変えてください。`
      : reason || '読み上げに失敗しました。'
  )
}

/**
 * VOICEVOX で合成して Audio に載せる。合成が済んでから返すので、
 * プレーヤーは次の塊を再生中に先読みできる。
 */
async function prepareVoicevox(text, cfg) {
  const result = await ipc().invoke('tts:speak', {
    text,
    speakerId: cfg.speakerId,
    port: cfg.port,
    params: cfg.params
  })
  if (!result.ok) throw voicevoxError(result, cfg)
  if (isStaleMain(result)) throw new Error(STALE_MAIN_MESSAGE)

  const blob = new Blob([result.wav], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.volume = Math.min(1, Math.max(0, cfg.volume != null ? cfg.volume : 1))
  // 再生中の話速変更は playbackRate で即座に追従させる。ピッチは保つ
  audio.preservesPitch = true
  let released = false
  const release = () => {
    if (released) return
    released = true
    URL.revokeObjectURL(url)
  }
  return {
    play(onEnd) {
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          release()
          if (onEnd) onEnd()
          resolve()
        }
        audio.onerror = () => {
          release()
          reject(new Error('音声の再生に失敗しました。'))
        }
        audio.play().catch(reject)
      })
    },
    pause() {
      audio.pause()
    },
    resume() {
      audio.play().catch(() => {})
    },
    stop() {
      audio.pause()
      audio.currentTime = 0
      release()
    },
    setVolume(v) {
      audio.volume = Math.min(1, Math.max(0, v))
    },
    /** 合成済み音声の再生倍率（1 = 合成時の話速のまま） */
    setRate(r) {
      const rate = Math.min(4, Math.max(0.25, Number(r) || 1))
      audio.playbackRate = rate
    },
    label: cfg.speakerLabel || `VOICEVOX #${cfg.speakerId}`
  }
}

/**
 * 1 塊ぶんを合成して、再生を呼び手に任せる。プレーヤーが使う。
 * @param {string} text
 * @param {object} [overrides] getTtsConfig() の戻りに重ねる値
 *   （volume / speedMultiplier / params 等）
 */
export function preparePlayable(text, overrides) {
  const cfg = Object.assign({}, getTtsConfig(), overrides || {})
  return cfg.engine === ENGINE_VOICEVOX
    ? prepareVoicevox(text, cfg)
    : prepareBrowser(text, cfg)
}

/**
 * 設定を明示して読み上げる。設定画面の試聴は保存前の値で試せる必要があるので、
 * 保存済みの設定を読む speakText() とは別に用意する。
 *
 * @param {string} text
 * @param {object} overrides getTtsConfig() の戻りに重ねる値
 */
// 「合成の待ち時間中にもう一度呼ばれた」を見分ける番号。
// これが無いと、停止→再生を素早く繰り返した時に前回の合成結果が後から届いて
// 二重に鳴る（実機で報告あり）
let speakToken = 0

export async function speakTextWith(text, overrides) {
  stopSpeech()
  const token = ++speakToken
  const playable = await preparePlayable(text, overrides)
  if (token !== speakToken) {
    // 待っている間に次の再生か停止が来た。この結果は捨てる
    try {
      playable.stop()
    } catch (e) {
      /* 未再生の playable は止める物が無い */
    }
    return
  }
  // stopSpeech() から止められるよう、Audio 相当を currentAudio に載せる
  currentAudio = { pause: () => playable.stop() }
  await playable.play(() => {
    if (token === speakToken) currentAudio = null
  })
}

export async function speakText(text) {
  return speakTextWith(text, null)
}

/**
 * VOICEVOX エンジンに繋がるかを確かめる。設定画面の「接続テスト」から呼ぶ。
 * 保存前の値で試せるよう、port は引数で受ける。
 */
export function testVoicevox(port) {
  return ipc()
    .invoke('tts:ping', { port: port || DEFAULT_TTS_PORT })
    .catch(err => ({ ok: false, reason: (err && err.message) || 'IPC_FAILED' }))
    .then(res => {
      if (isStaleMain(res)) return { ok: false, message: STALE_MAIN_MESSAGE }
      if (res && res.ok) {
        return { ok: true, message: `VOICEVOX ${res.version} に接続しました` }
      }
      const reason = (res && res.reason) || ''
      return {
        ok: false,
        message: /ECONNREFUSED|ECONNRESET|timeout/.test(reason)
          ? 'VOICEVOX エンジンに繋がりません。VOICEVOX を起動してください。'
          : reason || '接続できませんでした'
      }
    })
}

/**
 * VOICEVOX の話者一覧。設定画面のキャラクター選択に使う。
 * @param {number} port
 * @returns {Promise<Array<{name, uuid, styles: Array<{id, name}>}>>}
 */
export function listVoicevoxSpeakers(port) {
  return ipc()
    .invoke('tts:speakers', { port: port || DEFAULT_TTS_PORT })
    .then(res => {
      if (res && res.ok) return res.speakers
      throw new Error((res && res.reason) || '話者一覧を取得できませんでした')
    })
}

/**
 * VOICEVOX 本体で保存したプリセット一覧。声の調整を本体と同じ値にするのに使う。
 * @returns {Promise<Array<{id, name, styleId, params}>>}
 */
export function listVoicevoxPresets(port) {
  return ipc()
    .invoke('tts:presets', { port: port || DEFAULT_TTS_PORT })
    .then(res => {
      if (res && res.ok) return res.presets
      throw new Error((res && res.reason) || 'プリセットを取得できませんでした')
    })
}

/**
 * 話者 ID から「名前（スタイル）」の表示名を作る。一覧に無ければ空。
 */
export function speakerLabelFor(speakers, speakerId) {
  for (const s of speakers || []) {
    for (const st of s.styles || []) {
      if (st.id === speakerId) return `${s.name}（${st.name}）`
    }
  }
  return ''
}

/**
 * OS 内蔵の音声一覧。日本語の声を先に並べる。
 */
export function listBrowserVoices() {
  const synth = getSynth()
  if (!synth) return []
  return sortBrowserVoices(synth.getVoices() || [])
}
