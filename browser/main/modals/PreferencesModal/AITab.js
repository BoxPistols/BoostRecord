import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { testAiConnection } from 'browser/main/lib/aiAssist'
import {
  ENGINE_BROWSER,
  ENGINE_VOICEVOX,
  listBrowserVoices,
  speakTextWith,
  stopSpeech,
  testVoicevox,
  listVoicevoxSpeakers,
  listVoicevoxPresets,
  speakerLabelFor,
  defaultVoicevoxParams
} from 'browser/main/lib/ttsAssist'
const {
  VOICEVOX_PARAMS,
  normalizeVoicevoxParams
} = require('../../../../lib/tts/params')

// 設定画面のスライダーの並び。VOICEVOX 本体の右パネルと同じ順
const VOICEVOX_SLIDERS = [
  { key: 'speed', label: 'Speed' },
  { key: 'pitch', label: 'Pitch' },
  { key: 'intonation', label: 'Intonation' },
  { key: 'volume', label: 'Volume' },
  { key: 'pauseScale', label: 'Pause length' },
  { key: 'prePause', label: 'Leading silence' },
  { key: 'postPause', label: 'Trailing silence' }
]
const PREVIEW_TEXT =
  'こんにちは。これは読み上げの試聴です。話速と抑揚をここで確かめられます。'
import {
  getEncryptionAvailable,
  getKeyStatus,
  migratePlaintextKeys,
  saveKey
} from 'browser/main/lib/aiKeys'
import {
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  modelLabel
} from 'browser/main/lib/aiModels'
import uiThemes from 'browser/lib/ui-themes'

const KEY_PATTERNS = {
  openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
  gemini: /^AIza[A-Za-z0-9\-_]{30,}$/
}

function modelChoices(provider, current) {
  const options = MODEL_OPTIONS[provider].slice()
  if (current && options.indexOf(current) === -1) options.push(current)
  return options
}

function validateKey(provider, key) {
  if (!key || !key.trim()) return null
  return KEY_PATTERNS[provider] && !KEY_PATTERNS[provider].test(key.trim())
    ? i18n.__('API key format looks incorrect')
    : null
}

const DEFAULT_TTS_PORT = 50021
// 里石ユカ（つぼみ）。lib/tts/ipc.js と ttsAssist の既定と揃える
const DEFAULT_TTS_SPEAKER = 126

class AITab extends React.Component {
  constructor(props) {
    super(props)
    const ai = (props.config && props.config.ai) || {}
    const tts = (props.config && props.config.tts) || {}
    this.state = {
      provider: ai.provider || 'openai',
      ttsEngine:
        tts.engine === ENGINE_VOICEVOX ? ENGINE_VOICEVOX : ENGINE_BROWSER,
      ttsVoiceURI: tts.voiceURI || '',
      // OS 内蔵の音声は非同期で読み込まれる（初回は空配列が返る）
      browserVoices: [],
      ttsTesting: false,
      ttsTestResult: null,
      openaiKey: (ai.openai && ai.openai.apiKey) || '',
      openaiModel: (ai.openai && ai.openai.model) || DEFAULT_MODELS.openai,
      geminiKey: (ai.gemini && ai.gemini.apiKey) || '',
      geminiModel: (ai.gemini && ai.gemini.model) || DEFAULT_MODELS.gemini,
      ttsPort: tts.port || DEFAULT_TTS_PORT,
      ttsSpeakerId: tts.speakerId != null ? tts.speakerId : DEFAULT_TTS_SPEAKER,
      ttsSpeakerLabel: tts.speakerLabel || '',
      // VOICEVOX の話者一覧（/speakers）。取れない間は ID の直接入力に落とす
      ttsSpeakers: [],
      ttsSpeakersError: '',
      ttsSpeakersLoading: false,
      ttsParams: normalizeVoicevoxParams(tts),
      ttsPreviewing: false,
      // VOICEVOX 本体で保存したプリセット。話者一覧と一緒に取る
      ttsPresets: [],
      ttsSkipUnit: tts.skipUnit || 'paragraph',
      // ループ試聴。スライダーを動かすと、その値で作り直して鳴らし続ける
      ttsLoop: false,
      saved: false,
      // provider -> true（テスト実行中）
      testing: {},
      // provider -> { ok: boolean, message: string }
      testResult: {},
      // main プロセスから受け取る鍵の状態。暗号化の可否は含まない
      // （調べるとキーチェーンの許可ダイアログが出るため、保存の直前まで
      // 遅らせている）
      keyStatus: { configured: {}, fromEnv: {} },
      // 状態が届くまでは保存させない
      keyStatusLoaded: false,
      // 暗号化の可否。保存を試みるまでは分からないので null
      encryptionAvailable: null,
      // 可否の問い合わせ中。この間の二度押しを弾く
      saving: false,
      // provider -> エラー文（保存に失敗したとき）
      keyError: {}
    }
  }

  refreshKeyStatus() {
    return getKeyStatus().then(keyStatus => {
      if (this.mounted) this.setState({ keyStatus, keyStatusLoaded: true })
      return keyStatus
    })
  }

  /**
   * 保存済みのキーを消す。空欄で保存＝削除にはしていない（空欄は「変更しない」
   * の意味なので、取り違えると意図せず鍵が消える）
   */
  handleClearKey(provider) {
    if (!window.confirm(i18n.__('Remove the saved API key for this provider?')))
      return
    saveKey(provider, '').then(res => {
      if (!this.mounted) return
      if (res && res.ok) {
        this.setState(prev => ({
          keyError: Object.assign({}, prev.keyError, { [provider]: null })
        }))
        this.refreshKeyStatus()
      } else {
        this.setState(prev => ({
          keyError: Object.assign({}, prev.keyError, {
            [provider]: (res && res.error) || 'FAILED'
          })
        }))
      }
    })
  }

  handleFormKeyDown(e) {
    // IME composition in progress — do not intercept
    if (e.nativeEvent && e.nativeEvent.isComposing) return
    // Cmd+Enter (Mac) or Ctrl+Enter (Win) = Save
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      this.handleSave()
    }
  }

  /**
   * 入力中のキー・モデルで実際に API を1回叩く。保存前でも試せることが
   * この機能の主旨なので、config ではなく state の値を渡す。
   */
  handleTestConnection(provider) {
    const key =
      provider === 'openai' ? this.state.openaiKey : this.state.geminiKey
    const model =
      provider === 'openai' ? this.state.openaiModel : this.state.geminiModel

    this.setState(prev => ({
      testing: Object.assign({}, prev.testing, { [provider]: true }),
      testResult: Object.assign({}, prev.testResult, { [provider]: null })
    }))

    testAiConnection({
      provider,
      model: model.trim(),
      apiKey: key.trim()
    }).then(result => {
      // 設定画面を閉じた後に解決した場合に setState しない
      if (!this.mounted) return
      this.setState(prev => ({
        testing: Object.assign({}, prev.testing, { [provider]: false }),
        testResult: Object.assign({}, prev.testResult, { [provider]: result })
      }))
    })
  }

  /**
   * 接続テストのボタンと結果表示。結果は保存とは独立なので、
   * カード内の最後に1行だけ添える。
   */
  renderConnectionTest(provider, c) {
    const busy = !!this.state.testing[provider]
    const result = this.state.testResult[provider]

    const rowStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${c.divider}`
    }
    const buttonStyle = {
      flex: '0 0 auto',
      padding: '6px 12px',
      background: 'transparent',
      border: `1px solid ${c.inputBorder}`,
      borderRadius: 6,
      color: c.text,
      fontSize: 12,
      fontFamily: 'inherit',
      cursor: busy ? 'default' : 'pointer',
      opacity: busy ? 0.6 : 1
    }
    // 失敗時のメッセージは API のエラー文がそのまま入るので折り返す
    const messageStyle = {
      flex: '1 1 auto',
      minWidth: 0,
      fontSize: 12,
      lineHeight: '1.5',
      overflowWrap: 'break-word',
      color: result ? (result.ok ? c.success : c.danger) : c.muted
    }

    let message = ''
    if (busy) message = i18n.__('Testing…')
    else if (result && result.ok) message = i18n.__('Connection succeeded')
    else if (result)
      message = `${i18n.__('Connection failed')}: ${result.message}`

    return (
      <div style={rowStyle}>
        <button
          style={buttonStyle}
          disabled={busy}
          onClick={() => this.handleTestConnection(provider)}
        >
          {i18n.__('Test connection')}
        </button>
        <span style={messageStyle} role='status' aria-live='polite'>
          {message}
        </span>
      </div>
    )
  }

  /**
   * API キー欄の下に出す1行。「保存済みか」「削除」「暗号化が使えない警告」
   * 「保存に失敗した理由」をまとめて扱う。
   */
  renderKeyStatus(provider, c) {
    // 状態は IPC 越しに非同期で届く。届く前に描くと嘘になるので待つ
    if (!this.state.keyStatusLoaded) return null
    const { configured } = this.state.keyStatus
    const available = this.state.encryptionAvailable
    const error = this.state.keyError[provider]
    const rowStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      fontSize: 12,
      lineHeight: '1.5'
    }

    if (error) {
      return (
        <div style={rowStyle}>
          <span style={{ color: c.danger }}>
            {`${i18n.__('Could not save the API key')}: ${error}`}
          </span>
        </div>
      )
    }

    // available が null の間は、まだ調べていない（調べるとダイアログが出る）。
    // 使えないと分かった時だけ伝える。**保存済みの行の代わりに出さない**
    // （出し分けにすると、預けてある鍵の「削除」ボタンが消える）
    const unavailableNotice =
      available === false ? (
        <div style={rowStyle}>
          <span style={{ color: c.muted }}>
            {i18n.__(
              'Encrypted storage is unavailable on this system. The key is saved unencrypted in the app config.'
            )}
          </span>
        </div>
      ) : null

    if (!configured[provider]) {
      return (
        <div>
          {unavailableNotice}
          <div style={rowStyle}>
            <span style={{ color: c.muted }}>
              {i18n.__(
                'Not set. The key is stored in this OS credential store.'
              )}
            </span>
          </div>
        </div>
      )
    }

    return (
      <div>
        {unavailableNotice}
        <div style={rowStyle}>
          <span style={{ color: c.success }}>
            {i18n.__('Saved in this OS credential store')}
          </span>
          <button
            type='button'
            onClick={() => this.handleClearKey(provider)}
            style={{
              padding: '2px 8px',
              background: 'transparent',
              border: `1px solid ${c.inputBorder}`,
              borderRadius: 5,
              color: c.dim,
              // A11y: 12px 未満を使わない
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          >
            {i18n.__('Remove key')}
          </button>
        </div>
      </div>
    )
  }

  componentDidMount() {
    this.mounted = true
    // 話者一覧の再試行の回数。loadSpeakers から使う
    this.speakerRetryCount = 0
    // config に平文で残っているキーを資格情報ストアへ移す。**起動時ではなく
    // ここで**行う。移送は暗号化の可否を調べるのでキーチェーンの許可
    // ダイアログが出るが、起動のたびに出るのと、AI の設定を開いた時に出るのでは
    // 意味が違う。開いていない人には平文が残り続けるが、それは元からの状態
    migratePlaintextKeys()
      .then(() => {
        if (this.mounted) this.refreshKeyStatus()
      })
      .catch(err => {
        console.warn('AI key migration skipped:', err)
      })
    this.refreshKeyStatus()
    this.loadBrowserVoices()
    if (this.state.ttsEngine === ENGINE_VOICEVOX) this.loadSpeakers()
    // 声の一覧は非同期に届く。onvoiceschanged が来るまでは空
    const synth = typeof window !== 'undefined' && window.speechSynthesis
    if (synth) {
      this.handleVoicesChanged = () => this.loadBrowserVoices()
      synth.addEventListener('voiceschanged', this.handleVoicesChanged)
    }
  }

  componentWillUnmount() {
    this.mounted = false
    if (this.speakerRetryTimer) clearTimeout(this.speakerRetryTimer)
    if (this.previewRestartTimer) clearTimeout(this.previewRestartTimer)
    this.previewToken = (this.previewToken || 0) + 1
    const synth = typeof window !== 'undefined' && window.speechSynthesis
    if (synth && this.handleVoicesChanged) {
      synth.removeEventListener('voiceschanged', this.handleVoicesChanged)
    }
    stopSpeech()
  }

  loadBrowserVoices() {
    const voices = listBrowserVoices()
    if (this.mounted) this.setState({ browserVoices: voices })
  }

  /**
   * VOICEVOX の話者一覧を取り直す。ポートを変えた時・接続テストが通った時・
   * 「一覧を更新」を押した時に呼ぶ。
   */
  /**
   * VOICEVOX の話者一覧を取り直す。エンジンは起動と再起動に十数秒かかるので、
   * 失敗したら黙って間隔を空けて数回試す。利用者にボタンを押させない
   * （設定画面を開いたまま VOICEVOX を起動しても、そのうち一覧に変わる）
   * @param {boolean} [manual] 利用者が押した時は再試行の回数を数え直す
   */
  loadSpeakers(manual) {
    if (this.speakerRetryTimer) {
      clearTimeout(this.speakerRetryTimer)
      this.speakerRetryTimer = null
    }
    if (manual) this.speakerRetryCount = 0
    const port = parseInt(this.state.ttsPort, 10) || DEFAULT_TTS_PORT
    this.setState({ ttsSpeakersLoading: true, ttsSpeakersError: '' })
    // プリセットは無くても困らないので、失敗は黙って空にする
    listVoicevoxPresets(port).then(
      presets => {
        if (this.mounted) this.setState({ ttsPresets: presets })
      },
      () => {
        if (this.mounted) this.setState({ ttsPresets: [] })
      }
    )
    listVoicevoxSpeakers(port).then(
      speakers => {
        if (!this.mounted) return
        this.speakerRetryCount = 0
        const id = parseInt(this.state.ttsSpeakerId, 10)
        this.setState({
          ttsSpeakers: speakers,
          ttsSpeakersLoading: false,
          // 表示名は一覧から引き直す（名前が変わっていても保存時に追随する）
          ttsSpeakerLabel:
            speakerLabelFor(speakers, id) || this.state.ttsSpeakerLabel
        })
      },
      err => {
        if (!this.mounted) return
        this.setState({
          ttsSpeakersLoading: false,
          ttsSpeakersError: (err && err.message) || 'error'
        })
        // 3s → 6s → 12s → 20s → 20s。起動途中のエンジンはこの間に上がる
        const waits = [3000, 6000, 12000, 20000, 20000]
        const wait = waits[Math.min(this.speakerRetryCount, waits.length - 1)]
        this.speakerRetryCount += 1
        this.speakerRetryTimer = setTimeout(() => {
          this.speakerRetryTimer = null
          if (this.mounted && this.state.ttsEngine === ENGINE_VOICEVOX) {
            this.loadSpeakers()
          }
        }, wait)
      }
    )
  }

  // キャラクターを変えたら、そのキャラクターの最初のスタイルにする
  handleSpeakerChange(uuid) {
    const speaker = this.state.ttsSpeakers.find(sp => sp.uuid === uuid)
    if (!speaker || !speaker.styles.length) return
    const style = speaker.styles[0]
    this.setState({
      ttsSpeakerId: style.id,
      ttsSpeakerLabel: `${speaker.name}（${style.name}）`
    })
  }

  handleStyleChange(id) {
    const speakerId = parseInt(id, 10)
    this.setState({
      ttsSpeakerId: speakerId,
      ttsSpeakerLabel:
        speakerLabelFor(this.state.ttsSpeakers, speakerId) ||
        this.state.ttsSpeakerLabel
    })
  }

  // 本体のプリセットの値をスライダーへ写す（話者も合わせる）
  handleApplyPreset(id) {
    const preset = this.state.ttsPresets.find(p => String(p.id) === String(id))
    if (!preset) return
    const next = { ttsParams: normalizeVoicevoxParams(preset.params) }
    if (preset.styleId != null) {
      next.ttsSpeakerId = preset.styleId
      next.ttsSpeakerLabel =
        speakerLabelFor(this.state.ttsSpeakers, preset.styleId) ||
        this.state.ttsSpeakerLabel
    }
    this.setState(next)
  }

  handleParamChange(key, value) {
    const next = Object.assign({}, this.state.ttsParams, {
      [key]: Number(value)
    })
    this.setState({ ttsParams: normalizeVoicevoxParams(next) }, () => {
      // ループ試聴中は、指を止めてから少し置いて作り直す（合成は 1 回 0.5〜1 秒）
      if (!this.state.ttsLoop || !this.state.ttsPreviewing) return
      if (this.previewRestartTimer) clearTimeout(this.previewRestartTimer)
      this.previewRestartTimer = setTimeout(() => {
        this.previewRestartTimer = null
        if (this.mounted && this.state.ttsPreviewing) this.startPreview()
      }, 350)
    })
  }

  /**
   * 試聴を鳴らす。ループなら終わるたびに同じ文を作り直して鳴らす。
   * token で「止めた後に届いた再生」を捨てる
   */
  startPreview() {
    const { ttsPort, ttsSpeakerId, ttsParams, ttsSpeakerLabel } = this.state
    const token = (this.previewToken = (this.previewToken || 0) + 1)
    this.setState({ ttsPreviewing: true, ttsTestResult: null })
    speakTextWith(PREVIEW_TEXT, {
      engine: ENGINE_VOICEVOX,
      port: parseInt(ttsPort, 10) || DEFAULT_TTS_PORT,
      speakerId: parseInt(ttsSpeakerId, 10),
      params: ttsParams,
      speakerLabel: ttsSpeakerLabel
    })
      .then(() => {
        if (!this.mounted || token !== this.previewToken) return
        if (this.state.ttsLoop && this.state.ttsPreviewing) {
          this.startPreview()
          return
        }
        this.setState({ ttsPreviewing: false })
      })
      .catch(err => {
        if (!this.mounted || token !== this.previewToken) return
        this.setState({
          ttsPreviewing: false,
          ttsTestResult: { ok: false, message: err.message.split('\n')[0] }
        })
      })
  }

  stopPreview() {
    this.previewToken = (this.previewToken || 0) + 1
    if (this.previewRestartTimer) clearTimeout(this.previewRestartTimer)
    stopSpeech()
    this.setState({ ttsPreviewing: false })
  }

  /**
   * 試聴ボタン。鳴っている間は「停止」になる。接続テストは繋がるかしか
   * 分からず、声とパラメータの当たりは聞かないと決められない
   */
  handlePreviewVoicevox() {
    if (this.state.ttsPreviewing) this.stopPreview()
    else this.startPreview()
  }

  /**
   * 保存前の値でそのまま試す。VOICEVOX は起動していないと使えないので、
   * 「設定したのに何も起きない」で終わらせないために置く。
   */
  handleTestTts() {
    const { ttsEngine, ttsPort } = this.state
    this.setState({ ttsTesting: true, ttsTestResult: null })

    if (ttsEngine === ENGINE_VOICEVOX) {
      testVoicevox(parseInt(ttsPort, 10) || DEFAULT_TTS_PORT).then(
        result => {
          if (!this.mounted) return
          this.setState({ ttsTesting: false, ttsTestResult: result })
          // 繋がったなら話者一覧も取れるはず。ID 入力に落ちたままにしない
          if (result.ok) this.loadSpeakers(true)
        },
        err => {
          // ここで握らないと、押しっぱなしの「テスト中…」で固まる
          if (!this.mounted) return
          this.setState({
            ttsTesting: false,
            ttsTestResult: { ok: false, message: (err && err.message) || '' }
          })
        }
      )
      return
    }

    // 保存前の値で試す。保存済みの設定を読むと、選び直した直後に
    // 前の設定で再生してしまう
    speakTextWith(i18n.__('This is a test of the reading voice.'), {
      engine: ENGINE_BROWSER,
      voiceURI: this.state.ttsVoiceURI
    })
      .then(() => {
        if (!this.mounted) return
        this.setState({
          ttsTesting: false,
          ttsTestResult: { ok: true, message: i18n.__('Played the test voice') }
        })
      })
      .catch(err => {
        if (!this.mounted) return
        this.setState({
          ttsTesting: false,
          ttsTestResult: { ok: false, message: err.message }
        })
      })
  }

  handleSave() {
    const { openaiKey, geminiKey } = this.state
    if (validateKey('openai', openaiKey) || validateKey('gemini', geminiKey))
      return
    // 鍵の状態が届く前に保存しない
    if (!this.state.keyStatusLoaded) return

    // 暗号化の可否を調べる間に二度押しできると、同じキーを 2 回書きに行く
    if (this.state.saving) return

    // キーを預ける時だけ、暗号化が使えるかを調べる。この判定はキーチェーンに
    // 触るので、キーを入力していない保存（モデルや読み上げの設定だけ）で
    // 許可ダイアログを出さない
    const hasNewKey = !!(openaiKey.trim() || geminiKey.trim())
    if (!hasNewKey) {
      this.persist({ securedProviders: [], openaiKey: '', geminiKey: '' })
      return
    }

    this.setState({ saving: true })
    getEncryptionAvailable().then(available => {
      if (!this.mounted) return
      this.setState({ encryptionAvailable: available })

      if (!available) {
        // 平文で config に書くことになる。書いてから知らせるのでは遅いので、
        // 書く前に伝えて選んでもらう
        const proceed = window.confirm(
          i18n.__(
            'Encrypted storage is unavailable on this system. Save the API key unencrypted in the app config?'
          )
        )
        this.setState({ saving: false })
        if (!proceed) return
        this.persist({ securedProviders: [], openaiKey, geminiKey })
        return
      }

      // **先に預けてから** config の平文を落とす。順序を逆にすると、預けるのに
      // 失敗した時にキーがどこにも残らない（migratePlaintextKeys と同じ規則）
      this.saveKeysToStore({ openai: openaiKey, gemini: geminiKey }).then(
        securedProviders => {
          if (!this.mounted) return
          this.setState({ saving: false })
          this.persist({ securedProviders, openaiKey, geminiKey })
        }
      )
    })
  }

  /**
   * 設定を書き込む。資格情報ストアへ預けられた provider だけ config の平文を
   * 落とす。預けられなかったものは今までどおり config に残す（空文字にすると
   * 鍵を失う）。
   *
   * @param {{securedProviders: string[], openaiKey: string, geminiKey: string}} args
   */
  persist({ securedProviders, openaiKey, geminiKey }) {
    const {
      provider,
      openaiModel,
      geminiModel,
      ttsPort,
      ttsSpeakerId
    } = this.state
    const secured = securedProviders || []
    const ai = {
      provider,
      openai: {
        apiKey: secured.indexOf('openai') !== -1 ? '' : openaiKey.trim(),
        model: openaiModel.trim()
      },
      gemini: {
        apiKey: secured.indexOf('gemini') !== -1 ? '' : geminiKey.trim(),
        model: geminiModel.trim()
      }
    }
    const speakerId = parseInt(ttsSpeakerId, 10)
    // 音声パラメータは tts 直下に平置き（ConfigManager の既定と同じ形）
    const tts = Object.assign(
      {
        engine: this.state.ttsEngine,
        voiceURI: this.state.ttsVoiceURI,
        port: parseInt(ttsPort, 10) || DEFAULT_TTS_PORT,
        speakerId: Number.isNaN(speakerId) ? DEFAULT_TTS_SPEAKER : speakerId,
        speakerLabel: this.state.ttsSpeakerLabel || '',
        skipUnit: this.state.ttsSkipUnit
      },
      normalizeVoicevoxParams(this.state.ttsParams)
    )
    ConfigManager.set({ ai, tts })
    store.dispatch({ type: 'SET_UI', config: { ai, tts } })
    this.setState({ saved: true })
    setTimeout(() => this.setState({ saved: false }), 2000)
  }

  /**
   * 入力のあった provider だけ資格情報ストアへ保存する。
   * 空欄は「変更しない」。削除は handleClearKey（明示操作）に分けている。
   */
  saveKeysToStore(keys) {
    const pending = Object.keys(keys).filter(
      provider => !!keys[provider].trim()
    )
    if (!pending.length) return Promise.resolve([])

    return Promise.all(
      pending.map(provider =>
        saveKey(provider, keys[provider]).then(res => ({ provider, res }))
      )
    ).then(results => {
      if (!this.mounted) return []
      const keyError = Object.assign({}, this.state.keyError)
      const clearedFields = {}
      const secured = []
      results.forEach(({ provider, res }) => {
        if (res && res.ok) {
          keyError[provider] = null
          secured.push(provider)
          // 保存できたら入力欄は空にする。画面に残し続ける理由がなく、
          // 次の保存で二重に書き込むのも避けたい
          clearedFields[provider === 'openai' ? 'openaiKey' : 'geminiKey'] = ''
        } else {
          keyError[provider] = (res && res.error) || 'FAILED'
        }
      })
      this.setState(Object.assign({ keyError }, clearedFields))
      this.refreshKeyStatus()
      return secured
    })
  }

  /**
   * VOICEVOX のキャラクター / スタイル選択と声の調整スライダー。
   *
   * キャラクター名はエンジンの /speakers にしか無い（話者 ID からアプリ側で
   * 名前を引くことはできない）。繋がらない間は保存済みの名前を出し、
   * 数字だけを見せない。一覧は自動で取り直すので、押させるボタンは出さない
   */
  renderVoicevoxSpeaker(c, st) {
    const {
      ttsSpeakers,
      ttsSpeakersError,
      ttsSpeakersLoading,
      ttsSpeakerId,
      ttsSpeakerLabel,
      ttsParams,
      ttsPreviewing
    } = this.state
    const id = parseInt(ttsSpeakerId, 10)
    const current = ttsSpeakers.find(sp =>
      sp.styles.some(style => style.id === id)
    )
    const selected = current || ttsSpeakers[0]
    const rowStyle = { display: 'flex', gap: 8, alignItems: 'center' }
    // 試聴はキャラクターのすぐ右。選んで、その場で聞いて、決める並びにする
    const previewButtonStyle = Object.assign({}, st.testButtonStyle, {
      cursor: 'pointer',
      opacity: 1,
      whiteSpace: 'nowrap',
      // 鳴っている間は停止ボタンとして目立たせる
      borderColor: ttsPreviewing ? c.accent : st.testButtonStyle.borderColor,
      color: ttsPreviewing ? c.accent : st.testButtonStyle.color
    })
    const previewButton = (
      <button
        type='button'
        onClick={() => this.handlePreviewVoicevox()}
        style={previewButtonStyle}
        aria-pressed={ttsPreviewing}
      >
        <i
          className={ttsPreviewing ? 'fa fa-stop' : 'fa fa-play'}
          aria-hidden='true'
          style={{ marginRight: 6 }}
        />
        {ttsPreviewing ? i18n.__('Stop preview') : i18n.__('Preview voice')}
      </button>
    )
    const loopToggle = (
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: c.dim,
          whiteSpace: 'nowrap',
          cursor: 'pointer'
        }}
        title={i18n.__(
          'Keep playing the sample. Move a slider and the voice follows.'
        )}
      >
        <input
          type='checkbox'
          checked={this.state.ttsLoop}
          onChange={e => this.setState({ ttsLoop: e.target.checked })}
          style={{ margin: 0 }}
        />
        {i18n.__('Loop preview')}
      </label>
    )
    const sliderRow = {
      display: 'grid',
      gridTemplateColumns: '96px 1fr 52px',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
      fontSize: 12,
      color: c.dim
    }
    const numStyle = {
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
      color: c.text
    }
    // 一覧が無い時に出す名前。保存済みの表示名 → 無ければ ID
    const savedName =
      ttsSpeakerLabel || i18n.__('Speaker ID') + ' ' + ttsSpeakerId
    return (
      <div>
        <div style={st.fieldStyle}>
          <label style={st.labelStyle}>{i18n.__('Character')}</label>
          {ttsSpeakers.length ? (
            <div style={rowStyle}>
              <select
                value={selected ? selected.uuid : ''}
                onChange={e => this.handleSpeakerChange(e.target.value)}
                style={st.inputStyle(false)}
              >
                {ttsSpeakers.map(sp => (
                  <option key={sp.uuid} value={sp.uuid}>
                    {sp.name}
                  </option>
                ))}
              </select>
              <select
                value={String(ttsSpeakerId)}
                onChange={e => this.handleStyleChange(e.target.value)}
                style={st.inputStyle(false)}
                aria-label={i18n.__('Style')}
              >
                {(selected ? selected.styles : []).map(style => (
                  <option key={style.id} value={String(style.id)}>
                    {style.name}
                  </option>
                ))}
              </select>
              {previewButton}
              {loopToggle}
            </div>
          ) : (
            <div style={rowStyle}>
              <div
                style={Object.assign({}, st.inputStyle(false), {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  opacity: 0.75
                })}
              >
                <span>{savedName}</span>
                <span style={{ color: c.muted, fontSize: 12 }}>
                  {ttsSpeakersLoading
                    ? i18n.__('Connecting to VOICEVOX…')
                    : `ID ${ttsSpeakerId}`}
                </span>
              </div>
              {previewButton}
              {loopToggle}
            </div>
          )}
          {ttsSpeakers.length > 0 && !current && (
            <span style={st.errStyle}>
              {i18n.__(
                'This speaker ID is not in the running VOICEVOX. Pick a character above.'
              )}
            </span>
          )}
          {!ttsSpeakers.length && ttsSpeakersError && !ttsSpeakersLoading && (
            <span style={Object.assign({}, st.errStyle, { color: c.muted })}>
              {i18n.__(
                'Character names come from VOICEVOX, so they cannot be shown while it is closed. Start VOICEVOX and the list appears here on its own.'
              )}
            </span>
          )}
        </div>

        <div style={{ marginBottom: 0 }}>
          <label style={st.labelStyle}>{i18n.__('Voice tuning')}</label>
          <div style={Object.assign({}, st.helpStyle, { marginBottom: 8 })}>
            {i18n.__(
              'Defaults are slightly fast and flat. The same ranges as the VOICEVOX app.'
            )}
          </div>
          {this.state.ttsPresets.length > 0 && (
            <div style={Object.assign({}, rowStyle, { marginBottom: 10 })}>
              <select
                value=''
                onChange={e => this.handleApplyPreset(e.target.value)}
                style={st.inputStyle(false)}
                aria-label={i18n.__('Copy a VOICEVOX preset')}
              >
                <option value=''>{i18n.__('Copy a VOICEVOX preset…')}</option>
                {this.state.ttsPresets.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {this.state.ttsPresets.length === 0 && ttsSpeakers.length > 0 && (
            <div style={Object.assign({}, st.helpStyle, { marginBottom: 8 })}>
              {i18n.__(
                'To reuse the tuning from the VOICEVOX app, save it there as a preset (Presets > Register). It will appear here.'
              )}
            </div>
          )}
          {VOICEVOX_SLIDERS.map(({ key, label }) => {
            const spec = VOICEVOX_PARAMS[key]
            return (
              <label key={key} style={sliderRow}>
                <span>{i18n.__(label)}</span>
                <input
                  type='range'
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={ttsParams[key]}
                  onChange={e => this.handleParamChange(key, e.target.value)}
                  style={{ margin: 0, accentColor: c.accent }}
                />
                <span style={numStyle}>{ttsParams[key].toFixed(2)}</span>
              </label>
            )
          })}
          <button
            type='button'
            onClick={() =>
              this.setState({ ttsParams: defaultVoicevoxParams() })
            }
            style={Object.assign({}, st.testButtonStyle, {
              marginTop: 4,
              cursor: 'pointer',
              opacity: 1
            })}
          >
            {i18n.__('Reset to defaults')}
          </button>
        </div>
      </div>
    )
  }

  render() {
    const {
      provider,
      openaiKey,
      openaiModel,
      geminiKey,
      geminiModel,
      ttsEngine,
      ttsVoiceURI,
      ttsPort,
      // 話者と声の調整は renderVoicevoxSpeaker が this.state から直接読む
      ttsSpeakers,
      ttsTesting,
      ttsTestResult,
      browserVoices,
      saved
    } = this.state

    const openaiKeyError = validateKey('openai', openaiKey)
    const geminiKeyError = validateKey('gemini', geminiKey)
    // 鍵の保存先が確定するまでは押しても handleSave が降りるので、
    // 「押したのに無反応」にならないよう見た目も無効にしておく
    const hasError =
      !!(openaiKeyError || geminiKeyError) || !this.state.keyStatusLoaded

    // Derive darkness from the theme metadata, not a hardcoded name list — the
    // old list omitted rockabilly/monokai/nord/vulcan, so those dark themes got
    // the light palette (dark text on a dark modal = invisible labels).
    const themeName =
      (typeof document !== 'undefined' && document.body.dataset.theme) ||
      'default'
    const themeMeta = uiThemes.find(t => t.name === themeName)
    const isDark = themeMeta ? themeMeta.isDark : false

    // Design tokens — dark values use light-on-dark with sufficient contrast
    const c = isDark
      ? {
          text: 'rgba(255,255,255,0.90)',
          dim: 'rgba(255,255,255,0.60)',
          muted: 'rgba(255,255,255,0.38)',
          cardBg: 'rgba(255,255,255,0.07)',
          cardBorder: 'rgba(255,255,255,0.13)',
          inputBg: 'rgba(255,255,255,0.10)',
          inputBorder: 'rgba(255,255,255,0.22)',
          divider: 'rgba(255,255,255,0.09)',
          accent: '#7c6cf0',
          success: '#00b894',
          danger: '#e74c3c'
        }
      : {
          text: 'rgba(0,0,0,0.85)',
          dim: 'rgba(0,0,0,0.55)',
          muted: 'rgba(0,0,0,0.38)',
          cardBg: 'rgba(0,0,0,0.03)',
          cardBorder: 'rgba(0,0,0,0.12)',
          inputBg: '#ffffff',
          inputBorder: 'rgba(0,0,0,0.22)',
          divider: 'rgba(0,0,0,0.08)',
          accent: '#6c5ce7',
          success: '#00b894',
          danger: '#e74c3c'
        }

    // Layout: outer center wrapper avoids inheriting ConfigTab.styl flex rules
    const outerStyle = {
      display: 'flex',
      justifyContent: 'center',
      padding: '20px 16px 32px'
    }

    const innerStyle = {
      width: '100%',
      maxWidth: 760,
      boxSizing: 'border-box'
    }

    // OpenAI と Gemini は同じ役割なので左右に並べる。狭い窓では縦に折り返す
    const cardRowStyle = {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'stretch'
    }

    const cardColStyle = {
      flex: '1 1 320px',
      minWidth: 300,
      display: 'flex'
    }

    const pageTitleStyle = {
      fontSize: 15,
      fontWeight: 600,
      color: c.text,
      marginBottom: 20,
      letterSpacing: '-0.01em'
    }

    // 選択中の provider のカードは枠を accent にして「どちらが使われるか」を
    // 画面上で分かるようにする。以前はセグメントを押しても下の表示が一切
    // 変わらず、タブに見えるのに何も起きないコントロールになっていた
    const cardStyle = (active = false) => ({
      background: c.cardBg,
      border: `1px solid ${active ? c.accent : c.cardBorder}`,
      borderRadius: 8,
      padding: '16px 18px',
      marginBottom: 10,
      // 横並びにしたとき、キーの状態行の有無で高さが揃わないので伸ばす
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    })

    // 「使うのはどちらか」をカードの中で選ぶ。設定する場所と選ぶ場所が
    // 離れていると、上のセグメントを押しても下は変わらない見え方になる
    const useRadioStyle = active => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 999,
      border: `1px solid ${active ? c.accent : c.cardBorder}`,
      background: active ? c.accent : 'transparent',
      color: active ? '#fff' : c.dim,
      fontSize: 12,
      fontWeight: active ? 700 : 400,
      cursor: 'pointer',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap'
    })

    const cardTitleRowStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: `1px solid ${c.divider}`
    }

    const cardTitleStyle = {
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: c.muted,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }

    // カード見出し。右側に補助の要素（使用中バッジ・選択ラジオ）を置ける
    const cardTitle = (label, aside = null) => (
      <div style={cardTitleRowStyle}>
        <span style={cardTitleStyle}>{label}</span>
        {aside}
      </div>
    )

    // 「このプロバイダを使う」。role=radio で 2 枚のカードが 1 組になる
    const useRadio = p => (
      <button
        type='button'
        role='radio'
        aria-checked={provider === p}
        style={useRadioStyle(provider === p)}
        onClick={() => this.setState({ provider: p })}
      >
        {provider === p ? i18n.__('In use') : i18n.__('Use this provider')}
      </button>
    )

    const fieldStyle = { marginBottom: 14 }
    const fieldLastStyle = { marginBottom: 0 }

    const labelStyle = {
      display: 'block',
      fontSize: 12,
      fontWeight: 600,
      color: c.dim,
      marginBottom: 6
    }

    const inputStyle = hasErr => ({
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 12px',
      background: c.inputBg,
      border: `1px solid ${hasErr ? c.danger : c.inputBorder}`,
      borderRadius: 6,
      color: c.text,
      fontSize: 13,
      lineHeight: '1.4',
      outline: 'none',
      fontFamily: 'inherit'
    })

    const errStyle = {
      display: 'block',
      color: c.danger,
      fontSize: 12,
      marginTop: 5
    }

    // 項目の意味を 1 行で添える。設定名だけでは何が変わるか伝わらない
    const helpStyle = {
      fontSize: 12,
      lineHeight: '1.6',
      color: c.dim,
      marginBottom: 14
    }

    const testRowStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${c.divider}`
    }

    const testButtonStyle = {
      flex: '0 0 auto',
      padding: '6px 12px',
      background: 'transparent',
      border: `1px solid ${c.inputBorder}`,
      borderRadius: 6,
      color: c.text,
      fontSize: 12,
      fontFamily: 'inherit',
      cursor: ttsTesting ? 'default' : 'pointer',
      opacity: ttsTesting ? 0.6 : 1
    }

    const isMac =
      typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
    const saveShortcut = isMac ? '⌘ + Enter' : 'Ctrl + Enter'

    // 保存済みのキーは読み戻せない（main プロセスから外へ出さない設計）。
    // 空欄が「未設定」ではなく「変更しない」であることを placeholder で伝える
    const { configured } = this.state.keyStatus
    const keyPlaceholder = (provider, fallback) =>
      configured[provider]
        ? i18n.__('Saved — enter a new key only to replace it')
        : fallback

    return (
      <div style={outerStyle} onKeyDown={e => this.handleFormKeyDown(e)}>
        <div style={innerStyle}>
          <div style={pageTitleStyle}>{i18n.__('AI Settings')}</div>

          {/* BYOK 方針の明示。キーは同梱しないと決めたので、空欄のまま実行して
              エラーで気づく状態にせず、設定画面の先頭で伝える */}
          <div
            style={{
              fontSize: 12,
              lineHeight: '1.6',
              color: c.dim,
              background: c.cardBg,
              border: `1px solid ${c.cardBorder}`,
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 10
            }}
          >
            {i18n.__(
              "No API key is bundled — bring your own. Keys you enter are saved on this device only, and are sent to the provider's API when you use an AI action."
            )}
          </div>

          {/* OpenAI と Gemini は同じ役割なので左右に並べ、「どちらを使うか」も
              カードの中で選ぶ。上に選択用の帯を置くと、押しても下の表示が
              変わらないタブに見えていた */}
          <div
            style={cardRowStyle}
            role='radiogroup'
            aria-label={i18n.__('Provider in use')}
          >
            <div style={cardColStyle}>
              <div style={cardStyle(provider === 'openai')}>
                {cardTitle('OpenAI', useRadio('openai'))}
                <div style={fieldStyle}>
                  <label style={labelStyle}>{i18n.__('API Key')}</label>
                  <input
                    type='password'
                    value={openaiKey}
                    onChange={e => this.setState({ openaiKey: e.target.value })}
                    placeholder={keyPlaceholder('openai', 'sk-...')}
                    style={inputStyle(openaiKeyError)}
                  />
                  {openaiKeyError && (
                    <span style={errStyle}>{openaiKeyError}</span>
                  )}
                  {this.renderKeyStatus('openai', c)}
                </div>
                <div style={fieldLastStyle}>
                  <label style={labelStyle}>{i18n.__('Model')}</label>
                  <select
                    value={openaiModel}
                    onChange={e =>
                      this.setState({ openaiModel: e.target.value })
                    }
                    style={inputStyle(false)}
                  >
                    {modelChoices('openai', openaiModel).map((m, i) => (
                      <option key={m} value={m}>
                        {modelLabel(m, i === 0)}
                      </option>
                    ))}
                  </select>
                </div>
                {this.renderConnectionTest('openai', c)}
              </div>
            </div>
            <div style={cardColStyle}>
              <div style={cardStyle(provider === 'gemini')}>
                {cardTitle('Gemini', useRadio('gemini'))}
                <div style={fieldStyle}>
                  <label style={labelStyle}>{i18n.__('API Key')}</label>
                  <input
                    type='password'
                    value={geminiKey}
                    onChange={e => this.setState({ geminiKey: e.target.value })}
                    placeholder={keyPlaceholder('gemini', 'AIza...')}
                    style={inputStyle(geminiKeyError)}
                  />
                  {geminiKeyError && (
                    <span style={errStyle}>{geminiKeyError}</span>
                  )}
                  {this.renderKeyStatus('gemini', c)}
                </div>
                <div style={fieldLastStyle}>
                  <label style={labelStyle}>{i18n.__('Model')}</label>
                  <select
                    value={geminiModel}
                    onChange={e =>
                      this.setState({ geminiModel: e.target.value })
                    }
                    style={inputStyle(false)}
                  >
                    {modelChoices('gemini', geminiModel).map((m, i) => (
                      <option key={m} value={m}>
                        {modelLabel(m, i === 0)}
                      </option>
                    ))}
                  </select>
                </div>
                {this.renderConnectionTest('gemini', c)}
              </div>
            </div>
          </div>

          {/* 読み上げ */}
          <div style={cardStyle()}>
            {cardTitle(i18n.__('Read aloud'))}
            <div style={helpStyle}>
              {i18n.__(
                'Select text in a note and right-click for "Read aloud", or press the speaker button above the note to read the whole note. This setting decides which voice is used.'
              )}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{i18n.__('Skip unit')}</label>
              <select
                value={this.state.ttsSkipUnit}
                onChange={e => this.setState({ ttsSkipUnit: e.target.value })}
                style={inputStyle(false)}
              >
                <option value='paragraph'>{i18n.__('Paragraph')}</option>
                <option value='section'>{i18n.__('Heading')}</option>
                <option value='chunk'>{i18n.__('Sentence group')}</option>
              </select>
              <span style={Object.assign({}, errStyle, { color: c.muted })}>
                {i18n.__(
                  'What previous / next and the position bar move by. Heading matches the outline pane. You can also switch it on the player bar.'
                )}
              </span>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{i18n.__('Voice engine')}</label>
              <select
                value={ttsEngine}
                onChange={e => {
                  const engine = e.target.value
                  this.setState({ ttsEngine: engine, ttsTestResult: null })
                  if (engine === ENGINE_VOICEVOX && !ttsSpeakers.length) {
                    this.loadSpeakers(true)
                  }
                }}
                style={inputStyle(false)}
              >
                <option value={ENGINE_BROWSER}>
                  {i18n.__('Built-in system voice (no setup needed)')}
                </option>
                <option value={ENGINE_VOICEVOX}>
                  {i18n.__('VOICEVOX (requires the local engine)')}
                </option>
              </select>
            </div>

            {ttsEngine === ENGINE_BROWSER ? (
              <div style={fieldLastStyle}>
                <label style={labelStyle}>{i18n.__('Voice')}</label>
                <select
                  value={ttsVoiceURI}
                  onChange={e => this.setState({ ttsVoiceURI: e.target.value })}
                  style={inputStyle(false)}
                >
                  <option value=''>
                    {i18n.__('Auto (first Japanese voice)')}
                  </option>
                  {browserVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {`${v.name} (${v.lang})`}
                    </option>
                  ))}
                </select>
                {browserVoices.length === 0 && (
                  <span style={Object.assign({}, errStyle, { color: c.muted })}>
                    {i18n.__(
                      'No system voices found. macOS: System Settings > Accessibility > Spoken Content.'
                    )}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <div style={helpStyle}>
                  {i18n.__(
                    'VOICEVOX is a separate free app that synthesizes Japanese speech on this machine. Install it from voicevox.hiroshiba.jp, start it, and leave it running. Nothing is sent outside this machine.'
                  )}
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>{i18n.__('Port')}</label>
                  <input
                    type='number'
                    value={ttsPort}
                    min={1}
                    max={65535}
                    onChange={e => this.setState({ ttsPort: e.target.value })}
                    onBlur={() => this.loadSpeakers(true)}
                    onWheel={e => e.currentTarget.blur()}
                    style={inputStyle(false)}
                  />
                  <span style={Object.assign({}, errStyle, { color: c.muted })}>
                    {i18n.__(
                      'The port VOICEVOX listens on. 50021 unless you changed it.'
                    )}
                  </span>
                </div>
                {this.renderVoicevoxSpeaker(c, {
                  fieldStyle,
                  labelStyle,
                  inputStyle,
                  errStyle,
                  helpStyle,
                  testButtonStyle
                })}
              </div>
            )}

            <div style={testRowStyle}>
              <button
                type='button'
                onClick={() => this.handleTestTts()}
                disabled={ttsTesting}
                style={testButtonStyle}
              >
                {ttsTesting
                  ? i18n.__('Testing…')
                  : ttsEngine === ENGINE_VOICEVOX
                  ? i18n.__('Test connection')
                  : i18n.__('Play a test voice')}
              </button>

              {ttsTestResult && (
                <span
                  style={{
                    fontSize: 12,
                    color: ttsTestResult.ok ? c.success : c.danger
                  }}
                >
                  {ttsTestResult.message}
                </span>
              )}
            </div>
          </div>

          {/* Save */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 6
            }}
          >
            <button
              type='button'
              onClick={() => this.handleSave()}
              disabled={hasError}
              style={{
                padding: '9px 28px',
                borderRadius: 6,
                border: 'none',
                background: hasError
                  ? isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.10)'
                  : c.accent,
                color: hasError ? c.muted : '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: hasError ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {i18n.__('Save')}
            </button>
            <span style={{ color: c.muted, fontSize: 12 }}>{saveShortcut}</span>
            {saved && (
              <span style={{ color: c.success, fontSize: 13 }}>
                {i18n.__('Successfully applied!')}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }
}

AITab.propTypes = {
  config: PropTypes.object.isRequired,
  dispatch: PropTypes.func
}

export default CSSModules(AITab, styles)
