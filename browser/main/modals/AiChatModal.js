import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './AiChatModal.styl'
import ModalEscButton from 'browser/components/ModalEscButton'
import i18n from 'browser/lib/i18n'
import { buildHunks, applyHunks, countChanges } from 'browser/lib/textDiff'

// 文章を AI と一緒に直すための窓。
//
// 対象（選択範囲かノート全体）を決め、「改善案を出す」「簡潔に」などの指示か
// 自由文で頼む。AI は毎回「変更点の箇条書き」と「直した全文」を返す。直した全文は
// プレビューに出し、「適用」で対象を置き換える。適用後もその文章を土台にして
// 続けて頼める（対話しながら磨く）。会話は保存しない。

// 長い対象を毎回丸ごと送らないよう上限を設ける
const MAX_TARGET_CHARS = 12000
const MAX_HISTORY_CHARS = 6000

// 返答の型。直した全文はこのフェンスの中に入れさせ、機械的に取り出す
const REVISED_OPEN = '```revised'
const REVISED_CLOSE = '```'

const SYSTEM = [
  'You are an editing assistant inside a Markdown note app. The user gives you a target text (a selection or a whole note) and asks how to improve it.',
  'Every reply has exactly two parts, in this order:',
  '1. A short bullet list of the changes you made (what and why, one line each). Write it in the language of the target text.',
  '2. The complete revised target text inside a fenced block that starts with the line ```revised and ends with a line ```. The block must contain the whole revised text, not a fragment, so it can replace the original as-is.',
  'Keep everything the user did not ask you to change: facts, numbers, dates, links, code blocks, headings and list structure, front matter, and the original language. Do not add commentary outside the two parts.',
  'If the user only asks a question about the text and no change is wanted, answer briefly and omit the revised block.'
].join('\n')

// よく使う指示。押すとそのまま送る
const QUICK_ACTIONS = [
  {
    key: 'suggest',
    label: 'Suggest improvements',
    prompt:
      'この文章の改善案を出し、改善した全文を返してください。意味は変えないでください。'
  },
  {
    key: 'concise',
    label: 'Make it concise',
    prompt: '意味を変えずに簡潔で明快にしてください。'
  },
  {
    key: 'typos',
    label: 'Fix typos and inconsistencies',
    prompt:
      '誤字脱字、表記ゆれ、用語の不統一だけを直してください。それ以外は触らないでください。'
  },
  {
    key: 'dedupe',
    label: 'Merge duplicates',
    prompt:
      '重複している箇所や散らばっている同じ話題を1箇所にまとめてください。固有の情報は必ず1回残してください。'
  },
  {
    key: 'structure',
    label: 'Tidy the structure',
    prompt:
      '見出しの階層と箇条書きを整えて、読みやすい構造にしてください。本文の内容は変えないでください。'
  }
]

/** 返答から「変更点」と「直した全文」を分ける。フェンスが無ければ revised は null */
export function parseReply(text) {
  const src = String(text || '')
  const open = src.indexOf(REVISED_OPEN)
  if (open === -1) return { notes: src.trim(), revised: null, complete: true }
  const bodyStart = src.indexOf('\n', open)
  if (bodyStart === -1)
    return { notes: src.slice(0, open).trim(), revised: '', complete: false }
  const rest = src.slice(bodyStart + 1)
  // 閉じフェンスは「行頭の ```」。本文中のコードブロックの ``` と区別するため、
  // 最後に現れる行頭の ``` を閉じとみなす
  const closeAt = rest.lastIndexOf('\n' + REVISED_CLOSE)
  const endsWithFence = rest.trimEnd().endsWith(REVISED_CLOSE)
  if (closeAt === -1 || !endsWithFence) {
    return { notes: src.slice(0, open).trim(), revised: rest, complete: false }
  }
  return {
    notes: src.slice(0, open).trim(),
    revised: rest.slice(0, closeAt).replace(/\n$/, ''),
    complete: true
  }
}

function recentTurns(messages) {
  const lines = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    // 過去の返答は「変更点」だけを文脈にする（全文を繰り返し送らない）
    const content =
      m.role === 'assistant' ? parseReply(m.content).notes : m.content
    const line = (m.role === 'user' ? 'User: ' : 'Assistant: ') + content
    if (lines.length > 0 && total + line.length > MAX_HISTORY_CHARS) break
    lines.unshift(line)
    total += line.length
  }
  return lines
}

function buildPrompt(target, messages) {
  return [
    '# Target text (current version)',
    target.slice(0, MAX_TARGET_CHARS),
    '',
    '# Conversation',
    ...recentTurns(messages),
    'Assistant:'
  ].join('\n')
}

class AiChatModal extends React.Component {
  constructor(props) {
    super(props)
    const hasSelection = !!(props.selection && props.selection.trim())
    this.state = {
      // 'selection' | 'note'
      scope: hasSelection ? 'selection' : 'note',
      // 対象の「いまの文章」。適用するとここが更新され、続きの土台になる
      target: hasSelection ? props.selection : props.noteContent || '',
      messages: [],
      input: '',
      sending: false,
      error: null,
      applied: null, // 直近に適用した message の index
      // 返答ごとの表示（'diff' | 'full'）と、採用しない差分の塊の id
      view: {},
      excluded: {},
      // 適用の履歴。元に戻す / やり直すはこの並びを行き来して onApply し直す
      history: [hasSelection ? props.selection : props.noteContent || ''],
      historyIndex: 0
    }
  }

  // 対象を変えたら履歴も新しくする
  resetHistory(target) {
    return { history: [target || ''], historyIndex: 0 }
  }

  // 返答 index の差分の塊（元 = いまの対象、後 = 直した全文）
  hunksFor(index, revised) {
    return buildHunks(this.state.target, revised)
  }

  isExcluded(index, hunkId) {
    const ex = this.state.excluded[index]
    return !!(ex && ex.indexOf(hunkId) !== -1)
  }

  toggleHunk(index, hunkId) {
    this.setState(prev => {
      const cur = prev.excluded[index] || []
      const next =
        cur.indexOf(hunkId) !== -1
          ? cur.filter(x => x !== hunkId)
          : cur.concat([hunkId])
      return { excluded: Object.assign({}, prev.excluded, { [index]: next }) }
    })
  }

  setView(index, view) {
    this.setState(prev => ({
      view: Object.assign({}, prev.view, { [index]: view })
    }))
  }

  // 採用した塊だけを反映した全文
  selectedText(index, revised) {
    const hunks = this.hunksFor(index, revised)
    const chosen = hunks
      .filter(h => h.type === 'change' && !this.isExcluded(index, h.id))
      .map(h => h.id)
    return applyHunks(hunks, chosen, revised)
  }

  applyText(text, appliedIndex) {
    if (!this.props.onApply) return
    this.props.onApply(this.state.scope, text)
    this.setState(prev => {
      const history = prev.history
        .slice(0, prev.historyIndex + 1)
        .concat([text])
      return {
        target: text,
        applied: appliedIndex,
        history,
        historyIndex: history.length - 1
      }
    })
  }

  handleUndo() {
    const { history, historyIndex } = this.state
    if (historyIndex <= 0) return
    const text = history[historyIndex - 1]
    this.props.onApply(this.state.scope, text)
    this.setState({
      target: text,
      historyIndex: historyIndex - 1,
      applied: null
    })
  }

  handleRedo() {
    const { history, historyIndex } = this.state
    if (historyIndex >= history.length - 1) return
    const text = history[historyIndex + 1]
    this.props.onApply(this.state.scope, text)
    this.setState({
      target: text,
      historyIndex: historyIndex + 1,
      applied: null
    })
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

  handleScopeChange(scope) {
    if (scope === this.state.scope) return
    const target =
      scope === 'selection' ? this.props.selection : this.props.noteContent
    // 対象を変えたら会話も土台も新しくする（前の対象への指示が混ざらない）
    this.setState(
      Object.assign(
        {
          scope,
          target: target || '',
          messages: [],
          applied: null,
          excluded: {},
          view: {}
        },
        this.resetHistory(target)
      )
    )
  }

  handleSend(preset) {
    const text = (preset || this.state.input).trim()
    if (!text || this.state.sending) return
    if (!this.state.target.trim()) return

    const history = this.state.messages.concat({ role: 'user', content: text })
    const withPlaceholder = history.concat({ role: 'assistant', content: '' })
    this.setState({
      messages: withPlaceholder,
      input: '',
      sending: true,
      error: null
    })

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

    // aiAssist は ConfigManager 経由で electron を読む。送る時に読む
    const { runAiPrompt } = require('browser/main/lib/aiAssist')
    runAiPrompt({
      system: SYSTEM,
      prompt: buildPrompt(this.state.target, history),
      onDelta: append,
      // 全文を返させるので既定の上限では途中で切れる
      maxOutputTokens: 8000
    })
      .then(full => {
        if (!this.mounted) return
        this.setState(prev => {
          const next = prev.messages.slice()
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
          const messages =
            last && last.role === 'assistant' && !last.content
              ? prev.messages.slice(0, -1)
              : prev.messages
          return { messages, sending: false, error: err.message }
        })
      })
  }

  // 採用した差分だけで対象を置き換える。窓は閉じず、次の指示の土台にする
  handleApply(index, revised) {
    if (!this.props.onApply) return
    this.applyText(this.selectedText(index, revised), index)
  }

  renderDiff(index, revised) {
    const hunks = this.hunksFor(index, revised)
    const changes = countChanges(hunks)
    if (changes === 0) {
      return (
        <div styleName='diff-none'>
          {i18n.__('No differences from the current text.')}
        </div>
      )
    }
    return (
      <div styleName='diff'>
        {hunks.map((h, i) => {
          if (h.type === 'equal') {
            // 変更の前後 2 行だけ見せて、あとは畳む
            const lines = h.lines
            const head = i === 0 ? [] : lines.slice(0, 2)
            const tail = i === hunks.length - 1 ? [] : lines.slice(-2)
            const hidden = Math.max(0, lines.length - head.length - tail.length)
            return (
              <div key={`eq-${i}`} styleName='diff-equal'>
                {head.map((l, k) => (
                  <div key={`h${k}`} styleName='diff-line'>
                    {l || ' '}
                  </div>
                ))}
                {hidden > 0 && (
                  <div styleName='diff-skip'>
                    {i18n.__('%s unchanged lines', String(hidden))}
                  </div>
                )}
                {tail.map((l, k) => (
                  <div key={`t${k}`} styleName='diff-line'>
                    {l || ' '}
                  </div>
                ))}
              </div>
            )
          }
          const excluded = this.isExcluded(index, h.id)
          return (
            <label
              key={`ch-${h.id}`}
              styleName={excluded ? 'hunk--off' : 'hunk'}
            >
              <div styleName='hunk-head'>
                <input
                  type='checkbox'
                  checked={!excluded}
                  onChange={() => this.toggleHunk(index, h.id)}
                />
                <span>
                  {excluded
                    ? i18n.__('Keep the original here')
                    : i18n.__('Take this change')}
                </span>
              </div>
              {h.removed.map((l, k) => (
                <div key={`r${k}`} styleName='diff-line--removed'>
                  {l || ' '}
                </div>
              ))}
              {h.added.map((l, k) => (
                <div key={`a${k}`} styleName='diff-line--added'>
                  {l || ' '}
                </div>
              ))}
            </label>
          )
        })}
      </div>
    )
  }

  handleInsert(content) {
    if (this.props.onInsert) this.props.onInsert(content)
    this.props.close()
  }

  renderMessage(message, index) {
    const isUser = message.role === 'user'
    if (isUser) {
      return (
        <div key={index} styleName='message--user'>
          <div styleName='message-role'>{i18n.__('You')}</div>
          <div styleName='message-body'>{message.content}</div>
        </div>
      )
    }
    const { notes, revised, complete } = parseReply(message.content)
    const isLast = index === this.state.messages.length - 1
    const streaming = this.state.sending && isLast
    const applied = this.state.applied === index
    return (
      <div key={index} styleName='message--assistant'>
        <div styleName='message-role'>{i18n.__('AI')}</div>
        {(notes || streaming) && (
          <div styleName='message-body'>
            {notes || (streaming ? i18n.__('Thinking…') : '')}
          </div>
        )}
        {revised !== null && (
          <div styleName='revised'>
            <div styleName='revised-head'>
              <span>
                {complete
                  ? i18n.__('Revised text')
                  : i18n.__('Revised text (still arriving…)')}
              </span>
              {complete && (
                <span styleName='revised-tabs'>
                  <button
                    type='button'
                    styleName={
                      (this.state.view[index] || 'diff') === 'diff'
                        ? 'tab--active'
                        : 'tab'
                    }
                    onClick={() => this.setView(index, 'diff')}
                  >
                    {i18n.__('Changes')}{' '}
                    {countChanges(this.hunksFor(index, revised))}
                  </button>
                  <button
                    type='button'
                    styleName={
                      this.state.view[index] === 'full' ? 'tab--active' : 'tab'
                    }
                    onClick={() => this.setView(index, 'full')}
                  >
                    {i18n.__('Full text')}
                  </button>
                </span>
              )}
            </div>
            {complete && (this.state.view[index] || 'diff') === 'diff' ? (
              this.renderDiff(index, revised)
            ) : (
              <pre styleName='revised-body'>{revised}</pre>
            )}
            {complete && !streaming && (
              <div styleName='revised-actions'>
                <button
                  type='button'
                  styleName={applied ? 'apply--done' : 'apply'}
                  disabled={applied || !this.props.onApply}
                  onClick={() => this.handleApply(index, revised)}
                >
                  {applied
                    ? i18n.__('Applied')
                    : (this.state.excluded[index] || []).length
                    ? i18n.__('Apply the selected changes')
                    : this.state.scope === 'selection'
                    ? i18n.__('Replace the selection')
                    : i18n.__('Replace the whole note')}
                </button>
                {this.props.onInsert && (
                  <button
                    type='button'
                    styleName='message-insert'
                    onClick={() => this.handleInsert(revised)}
                  >
                    {i18n.__('Insert at the cursor instead')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  render() {
    const { messages, input, sending, error, scope, target } = this.state
    const hasSelection = !!(this.props.selection && this.props.selection.trim())
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
          <div styleName='title'>{i18n.__('Improve the text with AI')}</div>
          <div styleName='history'>
            <button
              type='button'
              styleName='history-button'
              disabled={this.state.historyIndex <= 0}
              onClick={() => this.handleUndo()}
              title={i18n.__('Undo the last apply')}
            >
              <i className='fa fa-undo' aria-hidden='true' /> {i18n.__('Undo')}
            </button>
            <button
              type='button'
              styleName='history-button'
              disabled={
                this.state.historyIndex >= this.state.history.length - 1
              }
              onClick={() => this.handleRedo()}
              title={i18n.__('Redo')}
            >
              <i className='fa fa-repeat' aria-hidden='true' />{' '}
              {i18n.__('Redo')}
            </button>
          </div>
          <ModalEscButton handleEscButtonClick={() => this.props.close()} />
        </div>

        {/* 対象。どこを直すのかを最初に決める */}
        <div styleName='scope'>
          <span styleName='scope-label'>{i18n.__('Target')}</span>
          <label
            styleName={hasSelection ? 'scope-option' : 'scope-option--off'}
          >
            <input
              type='radio'
              name='ai-scope'
              disabled={!hasSelection}
              checked={scope === 'selection'}
              onChange={() => this.handleScopeChange('selection')}
            />
            {i18n.__('Selection')}
            {hasSelection && (
              <span styleName='scope-meta'>
                {i18n.__('%s characters', String(this.props.selection.length))}
              </span>
            )}
          </label>
          <label styleName={hasNote ? 'scope-option' : 'scope-option--off'}>
            <input
              type='radio'
              name='ai-scope'
              disabled={!hasNote}
              checked={scope === 'note'}
              onChange={() => this.handleScopeChange('note')}
            />
            {i18n.__('Whole note')}
            {hasNote && (
              <span styleName='scope-meta'>
                {i18n.__(
                  '%s characters',
                  String(this.props.noteContent.length)
                )}
              </span>
            )}
          </label>
        </div>

        <div styleName='log' ref='log'>
          {messages.length === 0 ? (
            <div styleName='empty'>
              <p>
                {i18n.__(
                  'Pick what to do below, or type your own request. The AI replies with a list of changes and the revised text. Press Replace to put it into the note, then keep refining.'
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
          <div styleName='quick'>
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.key}
                type='button'
                styleName='quick-button'
                disabled={sending || !target.trim()}
                onClick={() => this.handleSend(a.prompt)}
              >
                {i18n.__(a.label)}
              </button>
            ))}
          </div>
          <textarea
            ref='input'
            styleName='input'
            rows={2}
            value={input}
            placeholder={i18n.__(
              'e.g. make the tone softer, shorten the second section, keep the list but reorder by date'
            )}
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
              disabled={sending || input.trim() === '' || !target.trim()}
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
  /** 開いた時点の選択範囲（無ければ空） */
  selection: PropTypes.string,
  /** (scope: 'selection'|'note', text) => void。対象を text で置き換える */
  onApply: PropTypes.func,
  onInsert: PropTypes.func
}

export default CSSModules(AiChatModal, styles)
