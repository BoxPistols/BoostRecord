import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from 'lucide-react'
import { formatCount } from '../find/findInText'

// 入力欄が広がる上限。これより長い検索語は欄の中でスクロールする
const MAX_ROWS = 5
const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

interface Props {
  query: string
  index: number
  count: number
  /** いま探している面。「検索」が一覧とノート内の2か所にあるので対象を書く */
  target: string
  /** 同じキーをもう一度押したとき、入力欄を選び直して打ち直せるようにする */
  focusToken: number
  onChange: (query: string) => void
  onStep: (direction: number) => void
  onClose: () => void
  /** 置換はエディタのときだけ。渡したときだけ置換欄の開閉を出す */
  replaceOpen?: boolean
  replaceValue?: string
  onToggleReplace?: () => void
  onReplaceChange?: (value: string) => void
  onReplace?: () => void
  onReplaceAll?: () => void
}

/**
 * ノート内検索バー。デスクトップ版の FindBar と同じ操作にしてある。
 * 要点は IME を壊さないこと: 入力は「探す」だけで現在地を動かさず、
 * 現在地を進めるのは Enter / Shift+Enter / ボタンだけ。変換確定の Enter では進めない
 */
export function FindBar(props: Props) {
  const { query, index, count, target, focusToken, onChange, onStep, onClose } = props
  const input = useRef<HTMLTextAreaElement>(null)
  const [composing, setComposing] = useState(false)
  const [replaceComposing, setReplaceComposing] = useState(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusToken])

  // 変換中の Enter は「確定」であって「次へ」ではない。環境で片方しか立たないので両方見る
  const isComposing = (e: KeyboardEvent, flag: boolean) =>
    flag || e.nativeEvent.isComposing || e.keyCode === 229

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      // 変換中の Esc は変換の取り消し。バーは閉じない
      if (isComposing(e, composing)) return
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Enter' || isComposing(e, composing)) return
    e.preventDefault()
    // Option（Alt）+Enter で改行を入れる（複数行を探せる）
    if (e.altKey) {
      const el = e.currentTarget
      el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end')
      onChange(el.value)
      return
    }
    onStep(e.shiftKey ? -1 : 1)
    // ↑↓ は割り当てない。IME の候補ウィンドウの操作キーなので奪うと日本語入力が壊れる
  }

  // Enter で今の一致を置換、⌘/Ctrl+Enter ですべて置換
  const onReplaceKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isComposing(e, replaceComposing)) return
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Enter' || isComposing(e, replaceComposing)) return
    e.preventDefault()
    ;(e.metaKey || e.ctrlKey ? props.onReplaceAll : props.onReplace)?.()
  }

  const empty = query !== '' && count === 0
  const canReplace = typeof props.onReplace === 'function'
  const mod = IS_MAC ? '⌘' : 'Ctrl'

  return (
    <div className="find-bar" role="search">
      <div className="find-row">
        {canReplace ? (
          <button
            className="find-step"
            onClick={props.onToggleReplace}
            aria-expanded={!!props.replaceOpen}
            title="置換の開閉"
            aria-label="置換の開閉"
          >
            {props.replaceOpen ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )}
          </button>
        ) : (
          <Search className="find-icon" size={14} aria-hidden />
        )}
        {/* 複数行を貼り付けて探せるよう textarea にする。行数に合わせて最大5行まで広がる */}
        <textarea
          ref={input}
          className={`find-input ${empty ? 'is-empty' : ''}`}
          rows={Math.min(MAX_ROWS, query.split('\n').length)}
          value={query}
          placeholder="このノート内を検索"
          aria-label="このノート内を検索"
          title={`${IS_MAC ? 'Option' : 'Alt'} + Enter で改行`}
          onChange={e => onChange(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={e => {
            setComposing(false)
            // 確定後の文字列で探し直す。現在地は動かさない
            onChange(e.currentTarget.value)
          }}
          onKeyDown={onKeyDown}
        />
        <span className={`find-count ${empty ? 'is-empty' : ''}`} aria-live="polite">
          {query === '' ? '' : formatCount(index, count)}
        </span>
        <button
          className="find-step"
          onClick={() => onStep(-1)}
          disabled={count === 0}
          title="前の一致 (Shift + Enter)"
          aria-label="前の一致"
        >
          <ChevronUp size={14} aria-hidden />
        </button>
        <button
          className="find-step"
          onClick={() => onStep(1)}
          disabled={count === 0}
          title="次の一致 (Enter)"
          aria-label="次の一致"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
        <span className="find-target">{target}</span>
        <button className="find-step" onClick={onClose} title="閉じる (Esc)" aria-label="閉じる">
          <X size={14} aria-hidden />
        </button>
      </div>
      {canReplace && props.replaceOpen && (
        <div className="find-row">
          <input
            className="find-input find-replace"
            type="text"
            value={props.replaceValue ?? ''}
            placeholder="置換後の文字列"
            aria-label="置換後の文字列"
            onChange={e => props.onReplaceChange?.(e.target.value)}
            onCompositionStart={() => setReplaceComposing(true)}
            onCompositionEnd={() => setReplaceComposing(false)}
            onKeyDown={onReplaceKeyDown}
          />
          <button
            className="find-action"
            onClick={props.onReplace}
            disabled={count === 0}
            title="この一致を置換 (Enter)"
          >
            置換
          </button>
          <button
            className="find-action"
            onClick={props.onReplaceAll}
            disabled={count === 0}
            title={`すべて置換 (${mod} + Enter)`}
          >
            すべて置換
          </button>
        </div>
      )}
    </div>
  )
}
