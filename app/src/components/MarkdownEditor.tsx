import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

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
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' }
  },
  { dark: true }
)

interface Props {
  /** Editing identity: re-mounts the editor state when the note changes. */
  noteKey: string
  value: string
  onChange: (value: string) => void
}

/**
 * Thin, controlled-ish CodeMirror 6 wrapper. The editor owns its document;
 * `onChange` lifts edits to React. Switching `noteKey` rebuilds the state so
 * each note edits independently (the collab build swaps this doc for a Y.Text).
 */
export function MarkdownEditor({ noteKey, value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        darkTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        })
      ]
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => v.destroy()
    // Rebuild only when the note identity changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey])

  return <div ref={host} style={{ height: '100%' }} />
}
