import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './AiChatModal.styl'
import ModalEscButton from 'browser/components/ModalEscButton'
import i18n from 'browser/lib/i18n'

// 会話をそのまま渡せる IPC が無いので、履歴は 1 本のプロンプトに畳んで送る。
// 長いノートを毎回丸ごと送らないよう、文脈にする本文には上限を設ける
const MAX_CONTEXT_CHARS = 6000
// 会話が長くなると、runAiPrompt 側の全体の上限で「後ろ」が落ちる。落ちるのは
// 直近の質問なので、こちらで先に古い順に捨てておく
const MAX_HISTORY_CHARS = 8000

const SYSTEM = [
  'You are a writing assistant inside a Markdown note app.',
  'Answer in the same language as the user.',
  'Be concrete and brief. Do not pad the answer with restatements of the question.',
  'When the user asks for text to put in their note, return just that text.'
].join(' ')

// 直近から詰めて、上限に収まるところまでを新しい順に採る。
// 最後の 1 件（いま送った質問）は上限を超えても必ず残す
function recentTurns(messages) {
  const lines = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const line = (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content
    if (lines.length > 0 && total + line.length > MAX_HISTORY_CHARS) break
    lines.unshift(line)
    total += line.length
  }
  return lines
}

function buildPrompt(messages, context) {
  const parts = []
  if (context) {
    parts.push('# The note the user is working on')
    parts.push(context.slice(0, MAX_CONTEXT_CHARS))
    parts.push('')
  }
  parts.push('# Conversation')
  parts.push(...recentTurns(messages))
  parts.push('Assistant:')
  return parts.join('\n')
}

class AiChatModal extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      messages: [],
      input: '',
      sending: false,
      error: null,
      // 本文がある時だけ既定でオン。何を送っているかは画面に出す
      includeNote: !!(props.noteContent && props.noteContent.trim())
    }
  }

  componentDidMount() {
    this.mounted = true
    if (this.refs.input) this.refs.input.focus()
  }

  componentWillUnmount() {
    this.mounted = false
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.messages !== this.state.messages && this.refs.log) {
      this.refs.log.scrollTop = this.refs.log.scrollHeight
    }
  }

  handleKeyDown(e) {
    if (e.keyCode === 27 && !this.state.sending) this.props.close()
  }

  handleInputKeyDown(e) {
    // 日本語 IME の確定 Enter で送信しない
    if (e.nativeEvent && e.nativeEvent.isComposing) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      this.handleSend()
    }
  }

  handleSend() {
    const text = this.state.input.trim()
    if (!text || this.state.sending) return

    const history = this.state.messages.concat({ role: 'user', content: text })
    // 応答は空のまま先に置いて、届いた分から書き足す
    const withPlaceholder = history.concat({ role: 'assistant', content: '' })
    this.setState({
      messages: withPlaceholder,
      input: '',
      sending: true,
      error: null
    })

    const context = this.state.includeNote ? this.props.noteContent : ''
    const append = delta => {
      if (!this.mounted) return
      this.setState(prev => {
        const next = prev.messages.slice()
        const last = next[next.length - 1]
        next[next.length - 1] = {
          role: 'assistant',
          content: last.content + delta
        }
        return { messages: next }
      })
    }

    // aiAssist は ConfigManager 経由で electron を読む。このモジュールを
    // import しただけで electron に触らせないよう、送る時に読む
    const { runAiPrompt } = require('browser/main/lib/aiAssist')
    runAiPrompt({
      system: SYSTEM,
      prompt: buildPrompt(history, context),
      onDelta: append
    })
      .then(full => {
        if (!this.mounted) return
        this.setState(prev => {
          const next = prev.messages.slice()
          // ストリームが来ない provider でも本文が入るようにする
          if (!next[next.length - 1].content) {
            next[next.length - 1] = { role: 'assistant', content: full }
          }
          return { messages: next, sending: false }
        })
      })
      .catch(err => {
        if (!this.mounted) return
        this.setState(prev => {
          const last = prev.messages[prev.messages.length - 1]
          // 空の吹き出しだけ消す。途中まで届いていた応答は残す
          const messages =
            last && last.role === 'assistant' && !last.content
              ? prev.messages.slice(0, -1)
              : prev.messages
          return { messages, sending: false, error: err.message }
        })
      })
  }

  handleInsert(content) {
    if (this.props.onInsert) this.props.onInsert(content)
    this.props.close()
  }

  renderMessage(message, index) {
    const isUser = message.role === 'user'
    return (
      <div
        key={index}
        styleName={isUser ? 'message--user' : 'message--assistant'}
      >
        <div styleName='message-role'>
          {isUser ? i18n.__('You') : i18n.__('AI')}
        </div>
        <div styleName='message-body'>
          {message.content || (this.state.sending ? i18n.__('Thinking…') : '')}
        </div>
        {!isUser && message.content && this.props.onInsert && (
          <button
            type='button'
            styleName='message-insert'
            onClick={() => this.handleInsert(message.content)}
          >
            {i18n.__('Insert into the note')}
          </button>
        )}
      </div>
    )
  }

  render() {
    const { messages, input, sending, error, includeNote } = this.state
    const hasNote = !!(this.props.noteContent && this.props.noteContent.trim())
    const shortcut = /Mac|iPhone|iPad|iPod/.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )
      ? '⌘ + Enter'
      : 'Ctrl + Enter'

    return (
      <div
        styleName='root'
        tabIndex='-1'
        onKeyDown={e => this.handleKeyDown(e)}
      >
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Ask the AI')}</div>
          <ModalEscButton handleEscButtonClick={() => this.props.close()} />
        </div>

        <div styleName='log' ref='log'>
          {messages.length === 0 ? (
            <div styleName='empty'>
              <p>
                {i18n.__(
                  'Ask about the note you have open — what it says, how to word something, what to do next.'
                )}
              </p>
              <p>
                {i18n.__(
                  'The conversation is not saved. It is gone when this window closes.'
                )}
              </p>
            </div>
          ) : (
            messages.map((m, i) => this.renderMessage(m, i))
          )}
        </div>

        {error !== null && <div styleName='error'>{error}</div>}

        <div styleName='control'>
          {hasNote && (
            <label styleName='context-toggle'>
              <input
                type='checkbox'
                checked={includeNote}
                onChange={e => this.setState({ includeNote: e.target.checked })}
              />
              &nbsp;
              {i18n.__('Send the current note as context')}
            </label>
          )}
          <textarea
            ref='input'
            styleName='input'
            rows={3}
            value={input}
            placeholder={i18n.__('e.g. summarize this note in three lines')}
            onChange={e => this.setState({ input: e.target.value })}
            onKeyDown={e => this.handleInputKeyDown(e)}
          />
          <div styleName='control-row'>
            <span styleName='hint'>
              {i18n.__('Enter for a new line, %s to send', shortcut)}
            </span>
            <button
              type='button'
              styleName='send'
              disabled={sending || input.trim() === ''}
              onClick={() => this.handleSend()}
            >
              {sending ? i18n.__('Sending…') : i18n.__('Send')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}

AiChatModal.propTypes = {
  close: PropTypes.func,
  noteContent: PropTypes.string,
  onInsert: PropTypes.func
}

export default CSSModules(AiChatModal, styles)
