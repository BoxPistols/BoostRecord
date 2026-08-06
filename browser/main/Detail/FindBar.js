import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './FindBar.styl'
import i18n from 'browser/lib/i18n'
import { formatCount } from 'browser/lib/findInText'

/**
 * ノート内検索バー。エディタとプレビューの両方で同じ見た目・同じ操作にする。
 *
 * 設計の要点は **IME を壊さないこと**。
 * 入力（onChange）は「探す」だけで、現在地は**絶対に動かさない**。
 * 現在地を進めるのは Enter / Shift+Enter / ボタンだけ。こうすると、
 * 変換中に検索が走っても画面が飛ばないし、変換確定の Enter が
 * 次のヒットへ飛ぶ事故も起きない。
 *
 * CodeMirror 内蔵ダイアログはこれができておらず（dialog.js は keyCode 13 を
 * 見るだけで isComposing を見ない）、日本語変換の確定 Enter がダイアログを
 * 閉じて未確定の文字列で検索していた。それを置き換えるのが本コンポーネント。
 */
class FindBar extends React.Component {
  constructor(props) {
    super(props)
    this.state = { composing: false }
    this.inputRef = React.createRef()
  }

  componentDidMount() {
    this.focusInput()
  }

  componentDidUpdate(prevProps) {
    // 同じキーをもう一度押した時は、入力欄を選択し直して打ち直せるようにする
    if (this.props.focusToken !== prevProps.focusToken) this.focusInput()
  }

  focusInput() {
    const el = this.inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }

  handleKeyDown(e) {
    // 変換中の Enter は「確定」であって「次へ」ではない。
    // isComposing と keyCode 229 の両方を見る（環境で片方しか立たない）
    const composing =
      this.state.composing ||
      (e.nativeEvent && e.nativeEvent.isComposing) ||
      e.keyCode === 229

    if (e.key === 'Escape') {
      e.preventDefault()
      this.props.onClose()
      return
    }
    if (e.key === 'Enter') {
      if (composing) return
      e.preventDefault()
      this.props.onStep(e.shiftKey ? -1 : 1)
    }
    // ↑↓ は割り当てない。IME の候補ウィンドウの操作キーなので奪うと
    // 日本語入力が壊れる
  }

  render() {
    const {
      query,
      index,
      count,
      onChange,
      onStep,
      onClose,
      target
    } = this.props
    const empty = query !== '' && count === 0

    return (
      <div
        styleName='root'
        className='FindBar'
        role='search'
        style={this.props.style}
      >
        <i styleName='icon' className='fa fa-search' aria-hidden='true' />
        <input
          styleName={empty ? 'input--empty' : 'input'}
          ref={this.inputRef}
          type='text'
          value={query}
          // このノートの中を探すことを明示する。サイドバー/上部の検索と
          // 同じ「検索」という語だけだと、どれが何を探すのか区別できない
          placeholder={i18n.__('Find in this note')}
          aria-label={i18n.__('Find in this note')}
          onChange={e => onChange(e.target.value)}
          onCompositionStart={() => this.setState({ composing: true })}
          onCompositionEnd={e => {
            this.setState({ composing: false })
            // 変換確定後の文字列で探し直す。**現在地は動かさない**
            onChange(e.target.value)
          }}
          onKeyDown={e => this.handleKeyDown(e)}
        />
        <span styleName={empty ? 'count--empty' : 'count'} aria-live='polite'>
          {query === '' ? '' : formatCount(index, count)}
        </span>
        <button
          styleName='step'
          onClick={() => onStep(-1)}
          disabled={count === 0}
          title={`${i18n.__('Previous match')} (Shift + Enter)`}
          aria-label={i18n.__('Previous match')}
        >
          <i className='fa fa-chevron-up' aria-hidden='true' />
        </button>
        <button
          styleName='step'
          onClick={() => onStep(1)}
          disabled={count === 0}
          title={`${i18n.__('Next match')} (Enter)`}
          aria-label={i18n.__('Next match')}
        >
          <i className='fa fa-chevron-down' aria-hidden='true' />
        </button>
        <span styleName='target'>{target}</span>
        <button
          styleName='close'
          onClick={onClose}
          title={`${i18n.__('Close')} (Esc)`}
          aria-label={i18n.__('Close')}
        >
          <i className='fa fa-times' aria-hidden='true' />
        </button>
      </div>
    )
  }
}

FindBar.propTypes = {
  style: PropTypes.object,
  query: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired,
  target: PropTypes.string,
  focusToken: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onStep: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default CSSModules(FindBar, styles)
