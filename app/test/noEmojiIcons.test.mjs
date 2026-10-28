// UI のアイコンは lucide-react の SVG を使い、絵文字や記号文字を置かない。
// 絵文字は OS ごとに絵柄も色も変わり、記号文字はフォントで太さと位置がずれる（2026-10-28 に却下）。
// 対象は src の全ファイル。ファイルを列挙すると、足し忘れたファイルを最初から見なくなる。
// キー名の ⌘ と、説明文の → ↔ は文字なので許す。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(import.meta.dirname, '..', 'src')

// 絵文字（Extended_Pictographic）と、アイコン代わりに使われやすい記号文字
const BANNED = /\p{Extended_Pictographic}|[★☆✎✏✕✖✗✘×«»▲▼△▽▾▸◂◀▶◫▤▦〈〉＋⬇⬆⬅➡⌨♻⚠✓✔]/gu
// ↔ などは Extended_Pictographic にも入っているが、説明文の矢印として使う
const ALLOWED = new Set(['⌘', '→', '←', '↔'])

function bannedIn(line) {
  return [...line.matchAll(BANNED)].map(m => m[0]).find(ch => !ALLOWED.has(ch))
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.(tsx?|css|html)$/.test(entry.name)) yield full
  }
}

test('src に絵文字や記号文字のアイコンが無い', () => {
  const found = []
  for (const file of walk(SRC)) {
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const ch = bannedIn(line)
        if (ch) found.push(`${path.relative(SRC, file)}:${i + 1} ${ch}  ${line.trim().slice(0, 80)}`)
      })
  }
  assert.deepEqual(found, [], `アイコンは lucide-react を使う:\n${found.join('\n')}`)
})

test('走査は実際に引っかかる（正規表現が空振りしていない）', () => {
  for (const ch of ['📒', '🗑', '👁', '★', '«', '▲', '＋', '⚠', '♻', '×']) {
    assert.equal(bannedIn(`x${ch}x`), ch)
  }
  for (const ch of ['⌘', '→', '↔', '#', '「']) assert.equal(bannedIn(`x${ch}x`), undefined, ch)
})
