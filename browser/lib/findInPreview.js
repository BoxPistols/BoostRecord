// プレビュー（iframe）内のキーワード検索。
//
// iframe の document を渡して使う。Range を作って CSS Custom Highlight API で
// 塗る。DOM を書き換えないので、プレビューの再描画やスクロール同期と喧嘩しない
// （span を差し込む実装だと、次の rewriteIframe で消えるうえに、
// markdown-it が生成した構造を壊してリンクやコードブロックの挙動が変わる）。
//
// findInText.js の findMatches を「文書全体を1本の文字列に畳んだもの」に対して
// 使い、得た位置を Range へ戻す。エディタ側と件数が必ず一致する。

import { findMatches } from './findInText'

const ALL_NAME = 'tb-find-all'
const ACTIVE_NAME = 'tb-find-active'

/** この環境で使えるか。使えなければ呼び出し側が機能ごと隠す */
export function isSupported(doc) {
  return !!(
    doc &&
    doc.defaultView &&
    doc.defaultView.CSS &&
    doc.defaultView.CSS.highlights &&
    typeof doc.createRange === 'function'
  )
}

/**
 * 文書内のテキストノードを文書順に集め、連結した文字列と対応表を返す。
 * script / style / 非表示要素は数えない（見えない文字を数えると
 * 「17件」と出ているのに16件しか辿れない、という形で壊れる）。
 */
function collectText(doc) {
  const win = doc.defaultView
  const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return win.NodeFilter.FILTER_REJECT
      const tag = parent.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
        return win.NodeFilter.FILTER_REJECT
      }
      // 非表示は数えない
      const style = win.getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return win.NodeFilter.FILTER_REJECT
      }
      if (!node.nodeValue) return win.NodeFilter.FILTER_REJECT
      return win.NodeFilter.FILTER_ACCEPT
    }
  })

  const nodes = []
  let text = ''
  let node = walker.nextNode()
  while (node) {
    nodes.push({
      node,
      start: text.length,
      end: text.length + node.nodeValue.length
    })
    text += node.nodeValue
    node = walker.nextNode()
  }
  return { text, nodes }
}

/** 文字列上の [start,end) を Range に戻す（複数ノードを跨いでよい） */
function rangeFor(doc, nodes, start, end) {
  let startNode = null
  let startOffset = 0
  let endNode = null
  let endOffset = 0
  for (let i = 0; i < nodes.length; i++) {
    const entry = nodes[i]
    if (startNode === null && start < entry.end) {
      startNode = entry.node
      startOffset = start - entry.start
    }
    if (end <= entry.end) {
      endNode = entry.node
      endOffset = end - entry.start
      break
    }
  }
  if (!startNode || !endNode) return null
  const range = doc.createRange()
  try {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
  } catch (e) {
    return null
  }
  return range
}

/**
 * 検索してハイライトを張る。**アクティブな一致は動かさない**
 * （呼び出し側が index を決める。ここで進めると IME の入力中に
 * 勝手にスクロールする）。
 *
 * @param {Document} doc iframe の document
 * @param {string} query
 * @param {{caseSensitive?: boolean}} [options]
 * @returns {{count: number, ranges: Range[]}}
 */
export function search(doc, query, options) {
  clear(doc)
  if (!isSupported(doc) || !query) return { count: 0, ranges: [] }

  const { text, nodes } = collectText(doc)
  const hits = findMatches(text, query, options)
  const ranges = []
  hits.forEach(hit => {
    const range = rangeFor(doc, nodes, hit.start, hit.end)
    if (range) ranges.push(range)
  })

  const win = doc.defaultView
  if (ranges.length) {
    win.CSS.highlights.set(ALL_NAME, new win.Highlight(...ranges))
  }
  return { count: ranges.length, ranges }
}

/**
 * index 番目の一致を「現在地」として塗り、画面内へスクロールする。
 *
 * @param {Document} doc
 * @param {Range[]} ranges
 * @param {number} index
 * @returns {boolean} 実際に移動できたか
 */
export function setActive(doc, ranges, index) {
  if (!isSupported(doc)) return false
  const win = doc.defaultView
  win.CSS.highlights.delete(ACTIVE_NAME)
  const range = ranges && ranges[index]
  if (!range) return false
  // **Range が生きているかは getClientRects で見る。**
  // rewriteIframe が body.innerHTML を差し替えると、CSS.highlights の
  // エントリは残ったまま Range が detach され、例外も警告も出ないまま
  // 何も光らなくなる。「登録済みか」では判定できない
  const rects = range.getClientRects()
  if (!rects || rects.length === 0) return false

  win.CSS.highlights.set(ACTIVE_NAME, new win.Highlight(range))
  const rect = rects[0]
  const view = win.innerHeight || 0
  if (rect.top < 0 || rect.bottom > view) {
    win.scrollBy(0, rect.top - view / 3)
  }
  return true
}

/** ハイライトを消す */
export function clear(doc) {
  if (!isSupported(doc)) return
  const win = doc.defaultView
  win.CSS.highlights.delete(ALL_NAME)
  win.CSS.highlights.delete(ACTIVE_NAME)
}
