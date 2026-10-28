import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { toggleWrap, makeLink } from '../markdown/format'
import type { FormatResult } from '../markdown/format'
import { findMarks } from '../find/editorFind'

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

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)', color: 'var(--fg)', height: '100%' },
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
  { dark: true }
)

interface Props {
  /** Editing identity: re-mounts the editor state when the note changes. */
  noteKey: string
  value: string
  onChange: (value: string) => void
  /** 作り直すたびに今の EditorView を渡す（ノート内検索が塗りと置換に使う） */
  onView?: (view: EditorView | null) => void
}

/**
 * Thin, controlled-ish CodeMirror 6 wrapper. The editor owns its document;
 * `onChange` lifts edits to React. Switching `noteKey` rebuilds the state so
 * each note edits independently (the collab build swaps this doc for a Y.Text).
 */
export function MarkdownEditor({ noteKey, value, onChange, onView }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onViewRef = useRef(onView)
  onViewRef.current = onView

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        formatKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        darkTheme,
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

  return <div ref={host} style={{ height: '100%' }} />
}
