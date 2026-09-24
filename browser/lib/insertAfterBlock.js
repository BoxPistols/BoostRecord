/**
 * @fileoverview 画像の段落（空行までのブロック）の直後に文章を挿入する。
 * プレビューのdata-lineは描き直すまで古いままなので、挿入する時点の原文から
 * 画像のファイル名を含む行を探し、data-lineは同名が複数あるときの目安にだけ使う
 */

/**
 * 画像のsrcから、原文で探すための名前（ファイル名）を取り出す
 * @param {string} src
 * @returns {string|null} data: URLなど名前を持たないものはnull
 */
export function imageNeedle(src) {
  if (typeof src !== 'string' || /^data:/i.test(src)) return null
  const clean = src.split(/[?#]/)[0]
  const name = clean.slice(clean.lastIndexOf('/') + 1)
  if (!name) return null
  try {
    return decodeURIComponent(name)
  } catch (e) {
    return name
  }
}

// 行に含まれる画像のURL（Markdownの![](url)とHTMLの<img src>）
const IMAGE_URL_PATTERN = /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b[^>]*\bsrc=["']([^"']+)["']/gi

// 行の中に、ファイル名がneedleと完全に一致する画像があるか。
// 部分一致だと、本文にファイル名を書いた行や、名前の一部が重なる別の画像を拾う
function hasImageNamed(line, needle) {
  IMAGE_URL_PATTERN.lastIndex = 0
  let m
  while ((m = IMAGE_URL_PATTERN.exec(line))) {
    if (imageNeedle(m[1] || m[2]) === needle) return true
  }
  return false
}

/**
 * 原文から画像の行を探す。同じ名前が複数あればhintLineに近い行を選ぶ
 * @param {Object} cm CodeMirrorのエディタ
 * @param {string|null} needle
 * @param {number} hintLine
 * @returns {number} needleが無ければhintLine。needleがあって原文に見つからなければ-1
 *   （古いかもしれないhintLineへ入れると、別の段落に挿入してしまうため）
 */
export function findImageLine(cm, needle, hintLine) {
  if (!needle) return hintLine
  let best = -1
  for (let i = 0; i < cm.lineCount(); i++) {
    if (!hasImageNamed(cm.getLine(i), needle)) continue
    const hint = hintLine >= 0 ? hintLine : 0
    if (best === -1 || Math.abs(i - hint) < Math.abs(best - hint)) best = i
  }
  return best
}

// ブロックの終わりの行（空行の手前）
function blockEnd(cm, startLine) {
  let end = startLine
  while (end + 1 < cm.lineCount() && cm.getLine(end + 1).trim() !== '') {
    end++
  }
  return end
}

/**
 * ブロックの直後（空行を飛ばした先）が文章と一致すれば、その範囲を返す
 * @returns {{from: {line:number, ch:number}, to: {line:number, ch:number}}|null}
 *   fromはブロックの行末（挿入時に足した空行ごと消せる位置）
 */
function findFollowing(cm, end, body) {
  let next = end + 1
  while (next < cm.lineCount() && cm.getLine(next).trim() === '') next++
  const count = body.split('\n').length
  const last = next + count - 1
  if (last >= cm.lineCount()) return null
  const lines = []
  for (let i = next; i <= last; i++) lines.push(cm.getLine(i))
  if (lines.join('\n').trim() !== body) return null
  return {
    from: { line: end, ch: cm.getLine(end).length },
    to: { line: last, ch: cm.getLine(last).length }
  }
}

/**
 * @param {Object} cm CodeMirrorのエディタ（getLine / lineCount / replaceRange）
 * @param {number} startLine ブロックの開始行（0始まり）
 * @param {string} text 挿入する文章
 * @param {string} [previous] 前にこの画像へ挿入した文章。直後に残っていれば置き換える
 * @returns {true|false|'exists'|'replaced'}
 *   挿入した / できなかった / 同じ文章が既に直後にある / 前の文章を置き換えた
 */
export function insertAfterBlock(cm, startLine, text, previous) {
  const body = text.trim()
  if (!body || !(startLine >= 0) || startLine >= cm.lineCount()) return false
  const end = blockEnd(cm, startLine)
  // 二重押しや開き直した後の再挿入で、同じ文章を重ねない
  if (findFollowing(cm, end, body)) return 'exists'
  const old = previous ? findFollowing(cm, end, previous.trim()) : null
  if (old) {
    cm.replaceRange(`\n\n${body}`, old.from, old.to)
    return 'replaced'
  }
  cm.replaceRange(`\n\n${body}`, { line: end, ch: cm.getLine(end).length })
  return true
}

/**
 * insertAfterBlockで入れた文章を取り除く。直後に同じ文章が無ければ何もしない
 * （手で書き換えた後に、別の文章を消さないため）
 * @returns {boolean} 取り除いたか
 */
export function removeAfterBlock(cm, startLine, text) {
  const body = (text || '').trim()
  if (!body || !(startLine >= 0) || startLine >= cm.lineCount()) return false
  const range = findFollowing(cm, blockEnd(cm, startLine), body)
  if (!range) return false
  cm.replaceRange('', range.from, range.to)
  return true
}

/**
 * 画像の下へ読み取った文章を入れる。位置は原文の画像の行で決める
 * @param {Object} cm
 * @param {string} src 画像のsrc
 * @param {number} hintLine プレビューのdata-line（古いことがある）
 * @param {string} text
 * @param {string} [previous] 前に入れた文章（置き換え対象）
 */
export function insertImageText(cm, src, hintLine, text, previous) {
  const line = findImageLine(cm, imageNeedle(src), hintLine)
  return insertAfterBlock(cm, line, text, previous)
}

/**
 * insertImageTextで入れた文章を取り除く
 */
export function removeImageText(cm, src, hintLine, text) {
  const line = findImageLine(cm, imageNeedle(src), hintLine)
  return removeAfterBlock(cm, line, text)
}
