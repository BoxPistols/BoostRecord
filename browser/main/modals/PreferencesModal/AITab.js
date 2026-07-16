import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { MODEL_OPTIONS, DEFAULT_MODELS } from 'browser/main/lib/aiAssist'
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
      saved: false
    }
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
    const ai = {
      provider,
      openai: { apiKey: openaiKey.trim(), model: openaiModel.trim() },
      gemini: { apiKey: geminiKey.trim(), model: geminiModel.trim() }
    }
    const tts = {
      port: parseInt(ttsPort, 10) || DEFAULT_TTS_PORT,
      speakerId: parseInt(ttsSpeakerId, 10) || DEFAULT_TTS_SPEAKER
    }
    ConfigManager.set({ ai, tts })
    store.dispatch({ type: 'SET_UI', config: { ai, tts } })
    this.setState({ saved: true })
    setTimeout(() => this.setState({ saved: false }), 2000)
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
    const hasError = !!(openaiKeyError || geminiKeyError)

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

    const cardStyle = {
      background: c.cardBg,
      border: `1px solid ${c.cardBorder}`,
      borderRadius: 8,
      padding: '16px 18px',
      marginBottom: 10
    }

    const cardTitleStyle = {
      display: 'block',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: c.muted,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: `1px solid ${c.divider}`
    }

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
      fontSize: 11,
      marginTop: 5
    }

    // Provider: segmented control (two halves sharing a border)
    const segWrapStyle = {
      display: 'flex',
      border: `1px solid ${c.cardBorder}`,
      borderRadius: 6,
      overflow: 'hidden'
    }

    const segBtnStyle = active => ({
      flex: 1,
      padding: '9px 0',
      textAlign: 'center',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      background: active ? c.accent : 'transparent',
      color: active ? '#fff' : c.dim,
      cursor: 'pointer',
      border: 'none',
      outline: 'none',
      fontFamily: 'inherit'
    })

    const isMac =
      typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
    const saveShortcut = isMac ? '⌘ + Enter' : 'Ctrl + Enter'

    return (
      <div style={outerStyle} onKeyDown={e => this.handleFormKeyDown(e)}>
        <div style={innerStyle}>
          <div style={pageTitleStyle}>AI Settings</div>

          {/* Provider */}
          <div style={cardStyle}>
            <span style={cardTitleStyle}>Provider</span>
            <div style={segWrapStyle}>
              {['openai', 'gemini'].map(p => (
                <button
                  key={p}
                  type='button'
                  style={segBtnStyle(provider === p)}
                  onClick={() => this.setState({ provider: p })}
                >
                  {p === 'openai' ? 'OpenAI' : 'Gemini'}
                </button>
              ))}
            </div>
          </div>

          {/* OpenAI */}
          <div style={cardStyle}>
            <span style={cardTitleStyle}>OpenAI</span>
            <div style={fieldStyle}>
              <label style={labelStyle}>API Key</label>
              <input
                type='password'
                value={openaiKey}
                onChange={e => this.setState({ openaiKey: e.target.value })}
                placeholder='sk-...'
                style={inputStyle(openaiKeyError)}
              />
              {openaiKeyError && <span style={errStyle}>{openaiKeyError}</span>}
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
                    {m}
                    {i === 0 ? ' （既定）' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Gemini */}
          <div style={cardStyle}>
            <span style={cardTitleStyle}>Gemini</span>
            <div style={fieldStyle}>
              <label style={labelStyle}>API Key</label>
              <input
                type='password'
                value={geminiKey}
                onChange={e => this.setState({ geminiKey: e.target.value })}
                placeholder='AIza...'
                style={inputStyle(geminiKeyError)}
              />
              {geminiKeyError && <span style={errStyle}>{geminiKeyError}</span>}
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
                    {m}
                    {i === 0 ? ' （既定）' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* VOICEVOX TTS */}
          <div style={cardStyle}>
            <span style={cardTitleStyle}>VOICEVOX TTS</span>
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
            <span style={{ color: c.muted, fontSize: 11 }}>{saveShortcut}</span>
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
