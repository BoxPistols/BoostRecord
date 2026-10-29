import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

// デスクトップ版（browser/lib/markdown.js・getTodoStatus.js・MarkdownEditor の
// handleCheckboxClick）と同じ書式を扱う。`- [ ] 本文` / `- [x] 本文`

const TASK_HEAD = /^\[([ xX])\] /
const md = new MarkdownIt()

function isTaskListItem(tokens: Token[], index: number) {
  const inline = tokens[index]
  if (
    inline.type !== 'inline' ||
    tokens[index - 1]?.type !== 'paragraph_open' ||
    tokens[index - 2]?.type !== 'list_item_open' ||
    !'-*+'.includes(tokens[index - 2].markup) ||
    !inline.children?.length
  ) {
    return null
  }
  const first = inline.children[0]
  const match = first.type === 'text' ? TASK_HEAD.exec(first.content) : null
  return match ? { inline, match } : null
}

/**
 * リスト項目の先頭の `[ ]` / `[x]` をチェックボックスにする。
 * 元の行番号を data-line に持たせ、クリックで元の Markdown を書き換えられるようにする
 */
export function taskListPlugin(md: MarkdownIt) {
  md.core.ruler.after('inline', 'task_list', state => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i]
      const task = isTaskListItem(tokens, i)
      if (!task || !inline.map) continue
      const children = inline.children!
      const first = children[0]
      const m = task.match
      const checked = m[1] !== ' '
      first.content = first.content.slice(m[0].length)
      const open = new state.Token('html_inline', '', 0)
      open.content =
        `<label class="task-label"><input type="checkbox" class="task-checkbox"` +
        ` data-line="${inline.map[0]}"${checked ? ' checked' : ''}><span class="task-check"></span>`
      const close = new state.Token('html_inline', '', 0)
      close.content = '</label>'
      children.unshift(open)
      children.push(close)
      tokens[i - 2].attrJoin('class', checked ? 'task-item checked' : 'task-item')
    }
  })
}

/** 指定した行（0 始まり）のチェックを反転する。タスク行でなければそのまま返す */
export function toggleTaskLine(content: string, line: number): string {
  const lines = content.split('\n')
  if (lines[line] === undefined) return content
  const tokens = md.parse(content, {})
  let markerIndex = -1
  for (let i = 2; i < tokens.length; i++) {
    const task = isTaskListItem(tokens, i)
    if (task?.inline.map?.[0] !== line) continue
    markerIndex = lines[line].indexOf(task.match[0].slice(0, 3))
    if (markerIndex >= 0) break
  }
  if (markerIndex < 0) return content
  const checked = lines[line][markerIndex + 1].toLowerCase() === 'x'
  lines[line] =
    lines[line].slice(0, markerIndex) +
    `[${checked ? ' ' : 'x'}]` +
    lines[line].slice(markerIndex + 3)
  return lines.join('\n')
}

/** タスクの数と完了数。コードブロックの中の行は数えない */
export function todoStatus(content: string): { total: number; completed: number } {
  let total = 0
  let completed = 0
  const tokens = md.parse(content, {})
  for (let i = 2; i < tokens.length; i++) {
    const task = isTaskListItem(tokens, i)
    if (!task) continue
    total++
    if (task.match[1].toLowerCase() === 'x') completed++
  }
  return { total, completed }
}
