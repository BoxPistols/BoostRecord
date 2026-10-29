import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, scrollPastEnd } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { toggleWrap, makeLink } from '../markdown/format'
import type { FormatResult } from '../markdown/format'
import { findMarks } from '../find/editorFind'
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

// ⌘/Ctrl+I italic, +K link. Placed before defaultKeymap to win.
// ⌘/Ctrl+B はデスクトップ版と同じくサイドバーの開閉に使う（App.tsx）
const formatKeymap = keymap.of([
  { key: 'Mod-i', run: formatCommand(s => toggleWrap(s, '*')) },
  { key: 'Mod-k', run: formatCommand(makeLink) }
])

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
}

/**
 * Thin, controlled-ish CodeMirror 6 wrapper. The editor owns its document;
 * `onChange` lifts edits to React. Switching `noteKey` rebuilds the state so
 * each note edits independently (the collab build swaps this doc for a Y.Text).
 */
export function MarkdownEditor({ noteKey, value, onChange, onView, settings }: Props) {
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

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        compartment.current.of(settingsExtensions(settingsRef.current)),
        history(),
        formatKeymap,
        // デスクトップ版の既定のホットキー。⌘/ は既定のコメント切り替えより先に取る
        keymap.of([
          { key: 'Mod-/', run: insertDate(iso) },
          { key: 'Ctrl-Shift-/', mac: 'Mod-Alt-/', run: insertDateTime(iso) },
          { key: 'Mod-Shift-f', run: prettifyMarkdown },
          { key: 'Mod-Shift-s', run: sortLines }
        ]),
        // Tab で字下げ（デスクトップ版と同じ）。Esc の直後の Tab はフォーカス移動に使える
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        findMarks,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
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
