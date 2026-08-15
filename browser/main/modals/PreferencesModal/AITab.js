import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { testAiConnection } from 'browser/main/lib/aiAssist'
import { getKeyStatus, saveKey } from 'browser/main/lib/aiKeys'
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
const DEFAULT_TTS_SPEAKER = 1

class AITab extends React.Component {
  constructor(props) {
    super(props)
    const ai = (props.config && props.config.ai) || {}
    const tts = (props.config && props.config.tts) || {}
    this.state = {
      provider: ai.provider || 'openai',
      openaiKey: (ai.openai && ai.openai.apiKey) || '',
      openaiModel: (ai.openai && ai.openai.model) || DEFAULT_MODELS.openai,
      geminiKey: (ai.gemini && ai.gemini.apiKey) || '',
      geminiModel: (ai.gemini && ai.gemini.model) || DEFAULT_MODELS.gemini,
      ttsPort: tts.port || DEFAULT_TTS_PORT,
      ttsSpeakerId: tts.speakerId != null ? tts.speakerId : DEFAULT_TTS_SPEAKER,
      saved: false,
      // provider -> true（テスト実行中）
      testing: {},
      // provider -> { ok: boolean, message: string }
      testResult: {},
      // main プロセスから受け取る鍵の状態。available=false なら暗号化ストアが
      // 使えないので、従来どおり config に平文で保存する
      keyStatus: { available: false, configured: {} },
      // 状態が届くまでは保存させない。届く前に保存すると available:false と
      // 誤認して、暗号化できる環境でも config へ平文を書いてしまう
      keyStatusLoaded: false,
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
    // 状態は IPC 越しに非同期で届く。届く前に available:false の初期値で描くと
    // 「暗号化が使えません」が一瞬出て嘘になるので、届くまで何も出さない
    if (!this.state.keyStatusLoaded) return null
    const { available, configured } = this.state.keyStatus
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

    if (!available) {
      return (
        <div style={rowStyle}>
          <span style={{ color: c.muted }}>
            {i18n.__(
              'Encrypted storage is unavailable on this system. The key is saved unencrypted in the app config.'
            )}
          </span>
        </div>
      )
    }

    if (!configured[provider]) {
      return (
        <div style={rowStyle}>
          <span style={{ color: c.muted }}>
            {i18n.__('Not set. The key is stored in this OS credential store.')}
          </span>
        </div>
      )
    }

    return (
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
            fontSize: 11,
            fontFamily: 'inherit',
            cursor: 'pointer'
          }}
        >
          {i18n.__('Remove key')}
        </button>
      </div>
    )
  }

  componentDidMount() {
    this.mounted = true
    this.refreshKeyStatus()
  }

  componentWillUnmount() {
    this.mounted = false
  }

  handleSave() {
    const {
      provider,
      openaiKey,
      openaiModel,
      geminiKey,
      geminiModel,
      ttsPort,
      ttsSpeakerId
    } = this.state
    if (validateKey('openai', openaiKey) || validateKey('gemini', geminiKey))
      return
    // 鍵の保存先が確定する前に保存しない（下の secure 判定が嘘になる）
    if (!this.state.keyStatusLoaded) return

    // 暗号化ストアが使えるなら config には平文を残さない。使えない環境では
    // 従来どおり config に保存する（ここで空文字にすると鍵を失う）
    const secure = this.state.keyStatus.available
    const ai = {
      provider,
      openai: {
        apiKey: secure ? '' : openaiKey.trim(),
        model: openaiModel.trim()
      },
      gemini: {
        apiKey: secure ? '' : geminiKey.trim(),
        model: geminiModel.trim()
      }
    }
    const tts = {
      port: parseInt(ttsPort, 10) || DEFAULT_TTS_PORT,
      speakerId: parseInt(ttsSpeakerId, 10) || DEFAULT_TTS_SPEAKER
    }
    ConfigManager.set({ ai, tts })
    store.dispatch({ type: 'SET_UI', config: { ai, tts } })
    this.setState({ saved: true })
    setTimeout(() => this.setState({ saved: false }), 2000)

    if (secure) this.saveKeysToStore({ openai: openaiKey, gemini: geminiKey })
  }

  /**
   * 入力のあった provider だけ資格情報ストアへ保存する。
   * 空欄は「変更しない」。削除は handleClearKey（明示操作）に分けている。
   */
  saveKeysToStore(keys) {
    const pending = Object.keys(keys).filter(
      provider => !!keys[provider].trim()
    )
    if (!pending.length) return

    Promise.all(
      pending.map(provider =>
        saveKey(provider, keys[provider]).then(res => ({ provider, res }))
      )
    ).then(results => {
      if (!this.mounted) return
      const keyError = Object.assign({}, this.state.keyError)
      const clearedFields = {}
      results.forEach(({ provider, res }) => {
        if (res && res.ok) {
          keyError[provider] = null
          // 保存できたら入力欄は空にする。画面に残し続ける理由がなく、
          // 次の保存で二重に書き込むのも避けたい
          clearedFields[provider === 'openai' ? 'openaiKey' : 'geminiKey'] = ''
        } else {
          keyError[provider] = (res && res.error) || 'FAILED'
        }
      })
      this.setState(Object.assign({ keyError }, clearedFields))
      this.refreshKeyStatus()
    })
  }

  render() {
    const {
      provider,
      openaiKey,
      openaiModel,
      geminiKey,
      geminiModel,
      ttsPort,
      ttsSpeakerId,
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
          // チップは白文字を乗せるので、accent のままだと 3.99:1 で
          // 基準割れ（実測）。**枠線と塗りで色を分ける**
          accentSolid: '#5a49c9',
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
          accentSolid: '#5344bd',
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
      maxWidth: 500,
      boxSizing: 'border-box'
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
      marginBottom: 10
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

    // 状態チップ。選択そのものではなく**結果**を表す
    const chipStyle = active => ({
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
      background: active ? c.accentSolid || c.accent : 'transparent',
      border: `1px solid ${active ? c.accentSolid || c.accent : c.cardBorder}`,
      color: active ? '#fff' : c.dim
    })

    /**
     * プロバイダのカードは**全体が選択肢**。見出しのラジオだけを的にすると
     * 押しどころが小さく、カードを押しても何も起きないので迷う。
     * ARIA の radio として振る舞わせ、キーボードでも選べるようにする
     */
    const providerCardProps = value => ({
      role: 'radio',
      'aria-checked': provider === value,
      'aria-label': value === 'openai' ? 'OpenAI' : 'Gemini',
      tabIndex: provider === value ? 0 : -1,
      style: Object.assign({}, cardStyle(provider === value), {
        cursor: 'pointer'
      }),
      onClick: e => {
        // 中の入力やボタンを押した時までカードの選択にしない
        if (
          e.target.closest &&
          e.target.closest('input, select, button, textarea, a')
        ) {
          return
        }
        this.setState({ provider: value })
      },
      onKeyDown: e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          this.setState({ provider: value })
        }
      }
    })

    // カード見出し。右端に状態チップ（使用中 / 未使用）を置く。
    // **選択はカード全体をクリック**して行う（上部のセグメンテッド
    // コントロールは「押しても下が切り替わらないタブ」に見えていたので廃止）
    const cardTitle = (label, choice = null) => (
      <div style={cardTitleRowStyle}>
        <span style={cardTitleStyle}>{label}</span>
        {choice && (
          <span style={chipStyle(choice.active)}>
            {choice.active ? i18n.__('In use') : i18n.__('Not in use')}
          </span>
        )}
      </div>
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

    const isMac =
      typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
    const saveShortcut = isMac ? '⌘ + Enter' : 'Ctrl + Enter'

    // 保存済みのキーは読み戻せない（main プロセスから外へ出さない設計）。
    // 空欄が「未設定」ではなく「変更しない」であることを placeholder で伝える
    const { available, configured } = this.state.keyStatus
    const keyPlaceholder = (provider, fallback) =>
      available && configured[provider]
        ? i18n.__('Saved — enter a new key only to replace it')
        : fallback

    return (
      <div style={outerStyle} onKeyDown={e => this.handleFormKeyDown(e)}>
        <div style={innerStyle}>
          <div style={pageTitleStyle}>AI Settings</div>

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

          {/* 使用するプロバイダ。2枚のカードで1つのラジオグループ */}
          <div role='radiogroup' aria-label={i18n.__('Provider in use')}>
            {/* OpenAI */}
            <div {...providerCardProps('openai')}>
              {cardTitle('OpenAI', {
                value: 'openai',
                active: provider === 'openai'
              })}
              <div style={fieldStyle}>
                <label style={labelStyle}>API Key</label>
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
                  onChange={e => this.setState({ openaiModel: e.target.value })}
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

            {/* Gemini */}
            <div {...providerCardProps('gemini')}>
              {cardTitle('Gemini', {
                value: 'gemini',
                active: provider === 'gemini'
              })}
              <div style={fieldStyle}>
                <label style={labelStyle}>API Key</label>
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
                  onChange={e => this.setState({ geminiModel: e.target.value })}
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

          {/* VOICEVOX TTS */}
          <div style={cardStyle()}>
            {cardTitle('VOICEVOX TTS')}
            <div style={fieldStyle}>
              <label style={labelStyle}>{i18n.__('Port')}</label>
              <input
                type='number'
                value={ttsPort}
                min={1}
                max={65535}
                onChange={e => this.setState({ ttsPort: e.target.value })}
                onWheel={e => e.currentTarget.blur()}
                style={inputStyle(false)}
              />
            </div>
            <div style={fieldLastStyle}>
              <label style={labelStyle}>{i18n.__('Speaker ID')}</label>
              <input
                type='number'
                value={ttsSpeakerId}
                min={0}
                onChange={e => this.setState({ ttsSpeakerId: e.target.value })}
                onWheel={e => e.currentTarget.blur()}
                style={inputStyle(false)}
              />
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
