import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, scrollPastEnd } from '@codemirror/view'
import { Annotation, Compartment, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { toggleWrap, makeLink } from '../markdown/format'
import type { FormatResult } from '../markdown/format'
import { findMarks } from '../find/editorFind'
import { toCodeMirror } from '../hotkeys'
import type { Bindings } from '../hotkeys'
import { insertDate, insertDateTime, prettifyMarkdown, sortLines } from '../markdown/editorCommands'

/** Build a CodeMirror command that applies a pure FormatResult transform. */
function formatCommand(transform: (selected: string) => FormatResult) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main
    const { text, selFrom, selTo } = transform(view.state.sliceDoc(from, to))
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + selFrom, head: from + selTo }
    })
    view.focus()
    return true
  }
}

// 外から取り込んだ変更の印。onChange へ送り返さない
const external = Annotation.define<boolean>()

/** エディタのショートカット。設定で変えたキーで作り直す。defaultKeymap より先に置いて勝たせる */
export type EditorKeys = Pick<Bindings, 'italic' | 'link' | 'insertDate' | 'insertDateTime' | 'prettify' | 'sortLines'>

function editorKeymap(keys: EditorKeys, iso: () => boolean) {
  const commands: [string, (view: EditorView) => boolean][] = [
    [keys.italic, formatCommand(s => toggleWrap(s, '*'))],
    [keys.link, formatCommand(makeLink)],
    // ⌘/ は既定のコメント切り替えより先に取る
    [keys.insertDate, insertDate(iso)],
    [keys.insertDateTime, insertDateTime(iso)],
    [keys.prettify, prettifyMarkdown],
    [keys.sortLines, sortLines]
  ]
  return keymap.of(
    commands.flatMap(([combo, run]) => {
      const key = toCodeMirror(combo)
      return key ? [{ key, run }] : []
    })
  )
}

// 色とフォントは CSS 変数で読むので、テーマを変えても作り直さなくてよい。
// dark の旗（選択色などの既定）だけは明るいテーマと分ける
const editorTheme = (dark: boolean) => EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)', color: 'var(--fg)', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-font-size)' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-list)',
      color: 'var(--faint)',
      border: 'none'
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
    // ノート内検索。選択色より先に目に入るよう、現在地だけ濃くする
    '.cm-find-match': { backgroundColor: 'var(--find-match)', borderRadius: '2px' },
    '.cm-find-active': { backgroundColor: 'var(--find-active)', color: '#111' }
  },
  { dark }
)

/** 設定の「エディタ」。デスクトップ版の editor.* と同じ項目 */
export interface EditorSettings {
  indentType: 'space' | 'tab'
  indentSize: number
  displayLineNumbers: boolean
  scrollPastEnd: boolean
  /** 日付の挿入で ISO 8601 を使う（作り直さず、押したときに読む） */
  dateFormatISO8601: boolean
  dark: boolean
}

function settingsExtensions(s: Omit<EditorSettings, 'dateFormatISO8601'>) {
  return [
    s.displayLineNumbers ? lineNumbers() : [],
    s.scrollPastEnd ? scrollPastEnd() : [],
    EditorState.tabSize.of(s.indentSize),
    indentUnit.of(s.indentType === 'tab' ? '\t' : ' '.repeat(s.indentSize)),
    editorTheme(s.dark)
  ]
}

interface Props {
  /** Editing identity: re-mounts the editor state when the note changes. */
  noteKey: string
  value: string
  onChange: (value: string) => void
  /** 作り直すたびに今の EditorView を渡す（ノート内検索が塗りと置換に使う） */
  onView?: (view: EditorView | null) => void
  settings: EditorSettings
  keys: EditorKeys
}

/**
 * Thin, controlled-ish CodeMirror 6 wrapper. The editor owns its document;
 * `onChange` lifts edits to React. Switching `noteKey` rebuilds the state so
 * each note edits independently (the collab build swaps this doc for a Y.Text).
 */
export function MarkdownEditor({ noteKey, value, onChange, onView, settings, keys }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onViewRef = useRef(onView)
  onViewRef.current = onView
  // 設定は作り直さずに差し替える（元に戻す履歴とカーソルを失わない）
  const compartment = useRef(new Compartment())
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const iso = () => settingsRef.current.dateFormatISO8601
  const keysCompartment = useRef(new Compartment())
  const keysRef = useRef(keys)
  keysRef.current = keys

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        compartment.current.of(settingsExtensions(settingsRef.current)),
        history(),
        keysCompartment.current.of(editorKeymap(keysRef.current, iso)),
        // Tab で字下げ（デスクトップ版と同じ）。Esc の直後の Tab はフォーカス移動に使える
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        findMarks,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => {
          if (u.docChanged && !u.transactions.some(t => t.annotation(external)))
            onChangeRef.current(u.state.doc.toString())
        })
      ]
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    onViewRef.current?.(v)
    return () => {
      onViewRef.current?.(null)
      v.destroy()
    }
    // Rebuild only when the note identity changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey])

  // プレビューのチェックボックスなど、エディタの外で本文が変わったときに取り込む。
  // 変わった範囲だけ差し替えるので、元に戻す履歴とカーソルが残る
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur === value) return
    let from = 0
    while (from < cur.length && from < value.length && cur[from] === value[from]) from++
    let end = 0
    while (
      end < cur.length - from &&
      end < value.length - from &&
      cur[cur.length - 1 - end] === value[value.length - 1 - end]
    )
      end++
    v.dispatch({
      changes: { from, to: cur.length - end, insert: value.slice(from, value.length - end) },
      annotations: external.of(true)
    })
  }, [value])

  // キーの割り当てを変えたら keymap だけ差し替える
  const keysKey = JSON.stringify(keys)
  useEffect(() => {
    view.current?.dispatch({
      effects: keysCompartment.current.reconfigure(editorKeymap(keysRef.current, () => settingsRef.current.dateFormatISO8601))
    })
  }, [keysKey])

  const { indentType, indentSize, displayLineNumbers, scrollPastEnd: pastEnd, dark } = settings
  useEffect(() => {
    view.current?.dispatch({
      effects: compartment.current.reconfigure(
        settingsExtensions({ indentType, indentSize, displayLineNumbers, scrollPastEnd: pastEnd, dark })
      )
    })
  }, [indentType, indentSize, displayLineNumbers, pastEnd, dark])

  return <div ref={host} style={{ height: '100%' }} />
}
