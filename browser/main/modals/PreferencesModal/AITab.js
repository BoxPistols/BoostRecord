import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { MODEL_OPTIONS, DEFAULT_MODELS } from 'browser/main/lib/aiAssist'

// Non-empty keys must match their provider's known prefix pattern.
const KEY_PATTERNS = {
  openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
  gemini: /^AIza[A-Za-z0-9\-_]{30,}$/
}

// The two cheapest models per provider (first = cheapest = default). A saved
// model outside this list (from an older config) stays selectable so we never
// silently rewrite the user's choice.
function modelChoices(provider, current) {
  const options = MODEL_OPTIONS[provider].slice()
  if (current && options.indexOf(current) === -1) options.push(current)
  return options
}

function validateKey(provider, key) {
  if (!key || !key.trim()) return null // empty = OK (uses env var)
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

    // Block save if there are key format errors
    if (validateKey('openai', openaiKey) || validateKey('gemini', geminiKey)) {
      return
    }

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

    const inputStyle = hasErr => ({
      width: 360,
      padding: '4px 8px',
      borderRadius: 4,
      border: hasErr ? '1px solid #e74c3c' : '1px solid #aaa',
      fontSize: 13
    })

    const errorStyle = {
      color: '#e74c3c',
      fontSize: 11,
      marginTop: 2
    }

    return (
      <div styleName='container'>
        <div styleName='header'>{i18n.__('AI Settings')}</div>

        <div
          styleName='box-minmax'
          style={{ height: 'auto', marginBottom: 20 }}
        >
          <span>{i18n.__('Provider')}</span>
          <span>
            <label style={{ marginRight: 16, cursor: 'pointer' }}>
              <input
                type='radio'
                value='openai'
                checked={provider === 'openai'}
                onChange={() => this.setState({ provider: 'openai' })}
                style={{ marginRight: 4 }}
              />
              OpenAI
            </label>
            <label style={{ cursor: 'pointer' }}>
              <input
                type='radio'
                value='gemini'
                checked={provider === 'gemini'}
                onChange={() => this.setState({ provider: 'gemini' })}
                style={{ marginRight: 4 }}
              />
              Gemini
            </label>
          </span>
        </div>

        <div
          styleName='header'
          style={{ fontSize: 18, marginBottom: 12, marginTop: 8 }}
        >
          OpenAI
        </div>

        <div
          styleName='box-minmax'
          style={{ height: 'auto', marginBottom: openaiKeyError ? 4 : 12 }}
        >
          <span>API Key</span>
          <div>
            <input
              type='password'
              value={openaiKey}
              onChange={e => this.setState({ openaiKey: e.target.value })}
              placeholder='sk-...'
              style={inputStyle(openaiKeyError)}
            />
            {openaiKeyError && <div style={errorStyle}>{openaiKeyError}</div>}
          </div>
        </div>

        <div
          styleName='box-minmax'
          style={{
            height: 'auto',
            marginBottom: 20,
            marginTop: openaiKeyError ? 8 : 0
          }}
        >
          <span>{i18n.__('Model')}</span>
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

        <div
          styleName='header'
          style={{ fontSize: 18, marginBottom: 12, marginTop: 8 }}
        >
          Gemini
        </div>

        <div
          styleName='box-minmax'
          style={{ height: 'auto', marginBottom: geminiKeyError ? 4 : 12 }}
        >
          <span>API Key</span>
          <div>
            <input
              type='password'
              value={geminiKey}
              onChange={e => this.setState({ geminiKey: e.target.value })}
              placeholder='AIza...'
              style={inputStyle(geminiKeyError)}
            />
            {geminiKeyError && <div style={errorStyle}>{geminiKeyError}</div>}
          </div>
        </div>

        <div
          styleName='box-minmax'
          style={{
            height: 'auto',
            marginBottom: 28,
            marginTop: geminiKeyError ? 8 : 0
          }}
        >
          <span>{i18n.__('Model')}</span>
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

        <div
          styleName='header'
          style={{ fontSize: 18, marginBottom: 12, marginTop: 8 }}
        >
          VOICEVOX TTS
        </div>

        <div
          styleName='box-minmax'
          style={{ height: 'auto', marginBottom: 12 }}
        >
          <span>{i18n.__('Port')}</span>
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

        <div
          styleName='box-minmax'
          style={{ height: 'auto', marginBottom: 28 }}
        >
          <span>{i18n.__('Speaker ID')}</span>
          <input
            type='number'
            value={ttsSpeakerId}
            min={0}
            onChange={e => this.setState({ ttsSpeakerId: e.target.value })}
            onWheel={e => e.currentTarget.blur()}
            style={inputStyle(false)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => this.handleSave()}
            disabled={hasError}
            style={{
              padding: '8px 24px',
              borderRadius: 4,
              border: 'none',
              background: hasError ? '#aaa' : '#6c5ce7',
              color: '#fff',
              fontSize: 14,
              cursor: hasError ? 'not-allowed' : 'pointer'
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
    )
  }
}

AITab.propTypes = {
  config: PropTypes.object.isRequired,
  dispatch: PropTypes.func
}

export default CSSModules(AITab, styles)
