// Browser client for the collab PoC: a HackMD-style split editor (CodeMirror 6
// source markdown on the left, live preview on the right) whose document is a
// shared Yjs Y.Text synced through the self-hosted Hocuspocus server.
//
// This is also the prototype of the modernized app's editor pane: same CM6 +
// markdown-it + DOMPurify pipeline, with real-time collaboration baked in.
//
// Open the page in two browser windows to see character-level co-editing with
// remote cursors. Run `npm run server` first, then `npm run dev`.

import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { yCollab } from 'y-codemirror.next'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const params = new URLSearchParams(location.search)
const NOTE = params.get('note') || 'note-1'
const TOKEN = params.get('token') || 'demo-pairing-secret'
const URL = `ws://${location.hostname}:1234`

document.getElementById('noteName').textContent = `▸ ${NOTE}`

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const preview = document.getElementById('preview')
const statusEl = document.getElementById('status')

const ydoc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: URL,
  name: NOTE,
  token: TOKEN,
  document: ydoc
})
const ytext = ydoc.getText('content')

provider.on('status', ({ status }) => {
  statusEl.textContent = status
  statusEl.classList.toggle('connected', status === 'connected')
})
provider.on('authenticationFailed', () => {
  statusEl.textContent = 'auth failed'
  statusEl.classList.remove('connected')
})

// Give this client a stable identity + colour so remote cursors are visible.
const palette = ['#ff2d75', '#4ade80', '#60a5fa', '#fbbf24', '#c084fc']
provider.awareness.setLocalStateField('user', {
  name: `device-${Math.floor(Math.random() * 1000)}`,
  color: palette[Math.floor(Math.random() * palette.length)]
})

function renderPreview() {
  // markdown-it is configured with html:false (no raw HTML), and we still
  // sanitize with DOMPurify and inject via a parsed fragment + replaceChildren
  // (no innerHTML) — defence in depth for untrusted note content.
  const clean = DOMPurify.sanitize(md.render(ytext.toString()))
  const frag = document.createRange().createContextualFragment(clean)
  preview.replaceChildren(frag)
}
ytext.observe(renderPreview)

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#1e2126', color: '#d7dae0', height: '100%' },
    '.cm-gutters': {
      backgroundColor: '#21252b',
      color: '#5c6370',
      border: 'none'
    },
    '.cm-content': { caretColor: '#ff2d75' }
  },
  { dark: true }
)

new EditorView({
  state: EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      darkTheme,
      EditorView.lineWrapping,
      // The Yjs binding: shared text + collaborative cursors (awareness) +
      // shared undo. This is the whole collaboration integration.
      yCollab(ytext, provider.awareness)
    ]
  }),
  parent: document.getElementById('editor')
})

renderPreview()
