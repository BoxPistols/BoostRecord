import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { formatDate, formatDateTime, sortLinesText } from './editorText'

export function insertDate(iso: () => boolean) {
  return (view: EditorView) => {
    view.dispatch(view.state.replaceSelection(formatDate(new Date(), iso())), { scrollIntoView: true })
    return true
  }
}

export function insertDateTime(iso: () => boolean) {
  return (view: EditorView) => {
    view.dispatch(view.state.replaceSelection(formatDateTime(new Date(), iso())), { scrollIntoView: true })
    return true
  }
}

/** 選んだ行を並べ替える。行の途中までの選択は行全体に広げる。選択が無ければ何もしない */
export function sortLines(view: EditorView) {
  const { from, to, empty } = view.state.selection.main
  if (empty) return true
  const doc = view.state.doc
  const start = doc.lineAt(from).from
  // 次の行の先頭まで選んでいるときは、その行を含めない
  const endLine = doc.lineAt(to > from && doc.lineAt(to).from === to ? to - 1 : to)
  const text = doc.sliceString(start, endLine.to)
  const sorted = sortLinesText(text)
  if (sorted !== text) {
    view.dispatch({
      changes: { from: start, to: endLine.to, insert: sorted },
      selection: { anchor: start, head: start + sorted.length }
    })
  }
  return true
}

/**
 * Markdown を prettier で整える（デスクトップ版の prettifyMarkdown）。
 * prettier は大きいので、初めて使うときに読み込む。prettier 3 は日本語と英数字の間に
 * 空白を足さず、表の幅も全角を 2 桁で数えるので、デスクトップ版の後処理は要らない
 */
export function prettifyMarkdown(view: EditorView) {
  const before = view.state.doc.toString()
  const cursor = view.state.selection.main.head
  void (async () => {
    const [prettier, markdown] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/markdown')
    ])
    // デスクトップ版の既定の prettierConfig と同じ
    const { formatted, cursorOffset } = await prettier.formatWithCursor(before, {
      parser: 'markdown',
      plugins: [markdown],
      cursorOffset: cursor,
      tabWidth: 2,
      semi: false,
      singleQuote: true,
      trailingComma: 'es5'
    })
    // 整えている間に打ったものは消さない
    if (view.state.doc.toString() !== before || formatted === before) return
    view.dispatch({
      changes: { from: 0, to: before.length, insert: formatted },
      selection: { anchor: Math.min(Math.max(cursorOffset, 0), formatted.length) },
      scrollIntoView: true,
      // 直前に打った分と混ぜず、⌘Z 1 回で整形だけを戻せるようにする
      annotations: isolateHistory.of('full')
    })
  })().catch(err => console.warn('prettify failed', err))
  return true
}
