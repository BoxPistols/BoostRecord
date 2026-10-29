import type MarkdownIt from 'markdown-it'

// デスクトップ版（browser/lib/markdown.js・getTodoStatus.js・MarkdownEditor の
// handleCheckboxClick）と同じ書式を扱う。`- [ ] 本文` / `- [x] 本文`

const TASK_HEAD = /^\[([ xX])\] /
const CHECKED_LINE = /^(\s*>?)*\s*[+\-*] \[x]/i
const UNCHECKED_LINE = /^(\s*>?)*\s*[+\-*] \[ ]/
const FENCE = /^\s*(```|~~~)/

/**
 * リスト項目の先頭の `[ ]` / `[x]` をチェックボックスにする。
 * 元の行番号を data-line に持たせ、クリックで元の Markdown を書き換えられるようにする
 */
export function taskListPlugin(md: MarkdownIt) {
  md.core.ruler.after('inline', 'task_list', state => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i]
      if (
        inline.type !== 'inline' ||
        tokens[i - 1].type !== 'paragraph_open' ||
        tokens[i - 2].type !== 'list_item_open' ||
        // 番号付きリストはデスクトップ版でも数えず、切り替えもしない
        !'-*+'.includes(tokens[i - 2].markup) ||
        !inline.map ||
        !inline.children?.length
      ) {
        continue
      }
      const first = inline.children[0]
      const m = first.type === 'text' ? TASK_HEAD.exec(first.content) : null
      if (!m) continue
      const checked = m[1] !== ' '
      first.content = first.content.slice(m[0].length)
      const open = new state.Token('html_inline', '', 0)
      open.content =
        `<label class="task-label"><input type="checkbox" class="task-checkbox"` +
        ` data-line="${inline.map[0]}"${checked ? ' checked' : ''}> `
      const close = new state.Token('html_inline', '', 0)
      close.content = '</label>'
      inline.children.unshift(open)
      inline.children.push(close)
      tokens[i - 2].attrJoin('class', checked ? 'task-item checked' : 'task-item')
    }
  })
}

/** 指定した行（0 始まり）のチェックを反転する。タスク行でなければそのまま返す */
export function toggleTaskLine(content: string, line: number): string {
  const lines = content.split('\n')
  const target = lines[line]
  if (target === undefined) return content
  if (CHECKED_LINE.test(target)) lines[line] = target.replace(/\[x]/i, '[ ]')
  else if (UNCHECKED_LINE.test(target)) lines[line] = target.replace('[ ]', '[x]')
  else return content
  return lines.join('\n')
}

/** タスクの数と完了数。コードブロックの中の行は数えない */
export function todoStatus(content: string): { total: number; completed: number } {
  let total = 0
  let completed = 0
  let inFence = false
  for (const raw of content.split('\n')) {
    if (FENCE.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const line = raw.trim().replace(/^(>\s*)*/, '')
    if (/^[+\-*] \[(\s|x)] ./i.test(line)) total++
    if (/^[+\-*] \[x] ./i.test(line)) completed++
  }
  return { total, completed }
}
