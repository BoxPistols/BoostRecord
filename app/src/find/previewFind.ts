// プレビュー側のノート内検索。Range を作って CSS Custom Highlight API で塗る。
// DOM を書き換えないので、プレビューの再描画とぶつからない
// （span を差し込むと markdown-it が作った構造が壊れ、リンクやコードの挙動が変わる）。
// 文書全体を1本の文字列に畳んで findMatches で探すので、エディタ側と判定が揃う
import { findMatches } from './findInText'

const ALL = 'tb-find-all'
const ACTIVE = 'tb-find-active'

/** この環境で使えるか（Firefox は 140 から）。使えなければ件数だけ出す */
export function isSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

interface TextEntry {
  node: Text
  start: number
  end: number
}

/**
 * 文書順にテキストノードを集める。非表示の要素は数えない
 * （見えない文字を数えると「17件」と出て16件しか辿れない形で壊れる）。
 * KaTeX は見た目用と読み上げ用（.katex-mathml）で同じ式を2回持つので、読み上げ用を除く
 */
function collectText(root: HTMLElement): { text: string; nodes: TextEntry[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT
      if (parent.closest('.katex-mathml, script, style')) return NodeFilter.FILTER_REJECT
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes: TextEntry[] = []
  let text = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const value = n.nodeValue || ''
    nodes.push({ node: n as Text, start: text.length, end: text.length + value.length })
    text += value
  }
  return { text, nodes }
}

/** 文字列上の [start,end) を Range に戻す（複数ノードを跨いでよい） */
function rangeFor(nodes: TextEntry[], start: number, end: number): Range | null {
  const first = nodes.find(e => start < e.end)
  const last = nodes.find(e => end <= e.end)
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, start - first.start)
  range.setEnd(last.node, end - last.start)
  return range
}

/** 探して塗る。現在地は動かさない（呼び出し側が決める） */
export function searchPreview(root: HTMLElement | null, query: string): Range[] {
  clearPreview()
  if (!root || !query) return []
  const { text, nodes } = collectText(root)
  const ranges = findMatches(text, query)
    .map(m => rangeFor(nodes, m.start, m.end))
    .filter((r): r is Range => r !== null)
  if (isSupported() && ranges.length) CSS.highlights.set(ALL, new Highlight(...ranges))
  return ranges
}

/** index 番目を現在地として塗る。scroll のときだけ画面内へ送る */
export function setPreviewActive(root: HTMLElement | null, ranges: Range[], index: number, scroll: boolean) {
  if (isSupported()) CSS.highlights.delete(ACTIVE)
  const range = ranges[index]
  // 再描画で外れた Range は矩形を持たない。登録済みかどうかでは判定できない
  const rect = range?.getClientRects()[0]
  if (!root || !range || !rect) return
  if (isSupported()) CSS.highlights.set(ACTIVE, new Highlight(range))
  if (!scroll) return
  const box = root.getBoundingClientRect()
  if (rect.top < box.top || rect.bottom > box.bottom) {
    root.scrollBy({ top: rect.top - box.top - box.height / 3 })
  }
}

export function clearPreview() {
  if (!isSupported()) return
  CSS.highlights.delete(ALL)
  CSS.highlights.delete(ACTIVE)
}
