// 続けて並べた画像を横に並べる。デスクトップ版（browser/lib/imageRows.js）と同じ判定。
// 改行をそのまま改行にする設定（既定）では、続けた行の画像は 1 つの <p> に <br> 区切りで入る。
// 画像（中身が画像だけのリンクを含む）が 2 つ以上あり、ほかに空白と <br> しか無い段落に印を付ける

const TEXT_NODE = 3
const ELEMENT_NODE = 1

function countRowImages(paragraph: Element): number {
  let count = 0
  for (const node of Array.from(paragraph.childNodes)) {
    if (node.nodeType === TEXT_NODE) {
      if ((node.textContent ?? '').trim() !== '') return -1
      continue
    }
    if (node.nodeType !== ELEMENT_NODE) continue
    const el = node as Element
    if (el.tagName === 'BR') continue
    if (el.tagName === 'IMG') {
      count++
      continue
    }
    // 画像を包むリンクはよい。文字の見えるリンクは本文
    if (el.tagName === 'A' && (el.textContent ?? '').trim() === '') {
      const inside = el.querySelectorAll('img').length
      if (inside === 0) return -1
      count += inside
      continue
    }
    return -1
  }
  return count
}

/** 当てはまる段落に image-row を付け、付けた数を返す */
export function markImageRows(root: ParentNode): number {
  let marked = 0
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!p.classList.contains('image-row') && countRowImages(p) >= 2) {
      p.classList.add('image-row')
      marked++
    }
  }
  return marked
}
