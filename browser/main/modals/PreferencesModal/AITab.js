import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'

// Non-empty keys must match their provider's known prefix pattern.
const KEY_PATTERNS = {
  openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
  gemini: /^AIza[A-Za-z0-9\-_]{30,}$/
}

function validateKey(provider, key) {
  if (!key || !key.trim()) return null // empty = OK (uses env var)
  return KEY_PATTERNS[provider] && !KEY_PATTERNS[provider].test(key.trim())
    ? i18n.__('API key format looks incorrect')
    : null
}

class AITab extends React.Component {
  constructor(props) {
    super(props)

    const ai = (props.config && props.config.ai) || {}
    this.state = {
      provider: ai.provider || 'openai',
      openaiKey: (ai.openai && ai.openai.apiKey) || '',
      openaiModel: (ai.openai && ai.openai.model) || 'gpt-5-mini',
      geminiKey: (ai.gemini && ai.gemini.apiKey) || '',
      geminiModel: (ai.gemini && ai.gemini.model) || 'gemini-2.5-flash',
      saved: false
    }
  }

  handleSave() {
    const {
      provider,
      openaiKey,
      openaiModel,
      geminiKey,
      geminiModel
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
    ConfigManager.set({ ai })
    store.dispatch({ type: 'SET_UI', config: { ai } })
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
          <input
            type='text'
            value={openaiModel}
            onChange={e => this.setState({ openaiModel: e.target.value })}
            placeholder='gpt-5-mini'
            style={inputStyle(false)}
          />
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
          <input
            type='text'
            value={geminiModel}
            onChange={e => this.setState({ geminiModel: e.target.value })}
            placeholder='gemini-2.5-flash'
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
