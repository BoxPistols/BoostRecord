import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { MODEL_OPTIONS, DEFAULT_MODELS } from 'browser/main/lib/aiAssist'

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

    // Detect dark vs light theme to use appropriate token values.
    const isDark =
      typeof document !== 'undefined' &&
      ['dark', 'solarized-dark', 'dracula'].indexOf(
        document.body.dataset.theme
      ) !== -1

    const tok = isDark
      ? {
          text: 'rgba(255,255,255,0.88)',
          dim: 'rgba(255,255,255,0.40)',
          card: 'rgba(255,255,255,0.05)',
          cardBorder: 'rgba(255,255,255,0.09)',
          divider: 'rgba(255,255,255,0.07)',
          inputBg: 'rgba(0,0,0,0.30)',
          inputBorder: 'rgba(255,255,255,0.16)',
          accent: '#7c6cf0',
          accentText: '#fff',
          secLabel: 'rgba(255,255,255,0.28)',
          placeholder: 'rgba(255,255,255,0.22)'
        }
      : {
          text: 'rgba(0,0,0,0.82)',
          dim: 'rgba(0,0,0,0.44)',
          card: 'rgba(0,0,0,0.03)',
          cardBorder: 'rgba(0,0,0,0.1)',
          divider: 'rgba(0,0,0,0.06)',
          inputBg: '#fff',
          inputBorder: 'rgba(0,0,0,0.18)',
          accent: '#6c5ce7',
          accentText: '#fff',
          secLabel: 'rgba(0,0,0,0.32)',
          placeholder: 'rgba(0,0,0,0.28)'
        }

    // --- shared style helpers ---
    const cardStyle = {
      background: tok.card,
      border: `1px solid ${tok.cardBorder}`,
      borderRadius: 8,
      padding: '18px 20px',
      marginBottom: 10
    }

    const secLabelStyle = {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.10em',
      textTransform: 'uppercase',
      color: tok.secLabel,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: `1px solid ${tok.divider}`
    }

    const fieldStyle = { marginBottom: 12 }

    const fieldLabelStyle = {
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      color: tok.dim,
      marginBottom: 5
    }

    const inputStyle = hasErr => ({
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      padding: '7px 11px',
      background: tok.inputBg,
      border: `1px solid ${hasErr ? '#e74c3c' : tok.inputBorder}`,
      borderRadius: 5,
      color: tok.text,
      fontSize: 13,
      outline: 'none',
      fontFamily: 'inherit'
    })

    const errStyle = { color: '#e74c3c', fontSize: 11, marginTop: 3 }

    // Provider pill buttons
    const pillStyle = active => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 18px',
      borderRadius: 20,
      border: `1px solid ${active ? tok.accent : tok.inputBorder}`,
      background: active ? tok.accent : 'transparent',
      color: active ? tok.accentText : tok.text,
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      marginRight: 8
    })

    return (
      <div styleName='container'>
        <div style={{ width: 540, paddingBottom: 32 }}>
          {/* Page title */}
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: tok.text,
              marginBottom: 18,
              letterSpacing: '-0.01em'
            }}
          >
            AI Settings
          </div>

          {/* Provider */}
          <div style={cardStyle}>
            <div style={secLabelStyle}>Provider</div>
            <div style={{ display: 'flex' }}>
              {['openai', 'gemini'].map(p => (
                <label key={p} style={pillStyle(provider === p)}>
                  <input
                    type='radio'
                    name='ai-provider'
                    value={p}
                    checked={provider === p}
                    onChange={() => this.setState({ provider: p })}
                    style={{ display: 'none' }}
                  />
                  {p === 'openai' ? 'OpenAI' : 'Gemini'}
                </label>
              ))}
            </div>
          </div>

          {/* OpenAI */}
          <div style={cardStyle}>
            <div style={secLabelStyle}>OpenAI</div>
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>API Key</span>
              <input
                type='password'
                value={openaiKey}
                onChange={e => this.setState({ openaiKey: e.target.value })}
                placeholder='sk-...'
                style={inputStyle(openaiKeyError)}
              />
              {openaiKeyError && <div style={errStyle}>{openaiKeyError}</div>}
            </div>
            <div style={{ ...fieldStyle, marginBottom: 0 }}>
              <span style={fieldLabelStyle}>{i18n.__('Model')}</span>
              <select
                value={openaiModel}
                onChange={e => this.setState({ openaiModel: e.target.value })}
                style={inputStyle(false)}
              >
                {modelChoices('openai', openaiModel).map((m, i) => (
                  <option key={m} value={m}>
                    {m + (i === 0 ? '（最安・既定）' : '')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Gemini */}
          <div style={cardStyle}>
            <div style={secLabelStyle}>Gemini</div>
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>API Key</span>
              <input
                type='password'
                value={geminiKey}
                onChange={e => this.setState({ geminiKey: e.target.value })}
                placeholder='AIza...'
                style={inputStyle(geminiKeyError)}
              />
              {geminiKeyError && <div style={errStyle}>{geminiKeyError}</div>}
            </div>
            <div style={{ ...fieldStyle, marginBottom: 0 }}>
              <span style={fieldLabelStyle}>{i18n.__('Model')}</span>
              <select
                value={geminiModel}
                onChange={e => this.setState({ geminiModel: e.target.value })}
                style={inputStyle(false)}
              >
                {modelChoices('gemini', geminiModel).map((m, i) => (
                  <option key={m} value={m}>
                    {m + (i === 0 ? '（最安・既定）' : '')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* VOICEVOX TTS */}
          <div style={cardStyle}>
            <div style={secLabelStyle}>VOICEVOX TTS</div>
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>{i18n.__('Port')}</span>
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
            <div style={{ ...fieldStyle, marginBottom: 0 }}>
              <span style={fieldLabelStyle}>{i18n.__('Speaker ID')}</span>
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
              onClick={() => this.handleSave()}
              disabled={hasError}
              style={{
                padding: '8px 28px',
                borderRadius: 5,
                border: 'none',
                background: hasError
                  ? isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.12)'
                  : tok.accent,
                color: hasError
                  ? isDark
                    ? 'rgba(255,255,255,0.25)'
                    : 'rgba(0,0,0,0.25)'
                  : '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: hasError ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em'
              }}
            >
              {i18n.__('Save')}
            </button>
            {saved && (
              <span style={{ color: '#00b894', fontSize: 13 }}>
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
