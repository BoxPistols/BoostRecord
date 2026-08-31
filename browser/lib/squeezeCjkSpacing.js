// 日本語と英数字の間に入った空白を詰める。
//
// prettier の markdown パーサは CJK と Latin の境目に半角スペースを差し込む。
// 「26 年 9 月 7〜14 日」「妻と 2 人で 1 週間」のように、書いていない空白が
// 整形のたびに増える。この挙動を止めるオプションは prettier 1.x には無いので、
// 整形の出力を通してから詰める。
//
// コードブロック（``` フェンス・インデント 4 桁）とインラインコードは対象外。
// 中身は文章ではないので、空白を詰めると意味が変わる。

// 日本語とみなす範囲。ひらがな・カタカナ・漢字・全角記号。
// U+3000（全角スペース）は空白側で扱うので入れない
const JP =
  '\\u3001-\\u303F\\u3041-\\u3096\\u3099-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF01-\\uFFEF'
const ALNUM = '0-9A-Za-z'
const SPACE = '[ \\t\\u3000]+'

const JP_THEN_ALNUM = new RegExp(`([${JP}])${SPACE}([${ALNUM}])`, 'g')
const ALNUM_THEN_JP = new RegExp(`([${ALNUM}])${SPACE}([${JP}])`, 'g')

// 「9 月 7 日」のように境目が連続すると 1 回の置換では拾いきれない
// （置換後の文字が次の境目の左側になるため）。変化が止まるまで回す
function squeezeRun(text) {
  let prev
  let out = text
  do {
    prev = out
    out = out.replace(JP_THEN_ALNUM, '$1$2').replace(ALNUM_THEN_JP, '$1$2')
  } while (out !== prev)
  return out
}

// インラインコード（`...`）は素通しする。1 行を ` で分割すると
// 奇数番目が code span になる。
//
// バッククォートの数が奇数の行は code span が閉じていない。markdown では
// 閉じていないバッククォートはただの文字なので、行全体を文章として扱う
// （ここで code span 扱いにすると、その行の以降がずっと詰められず、
// 整形のたびに空白が増え続ける）
function squeezeLine(line) {
  const parts = line.split('`')
  if (parts.length % 2 === 0) return squeezeRun(line)
  return parts
    .map((part, i) => (i % 2 === 0 ? squeezeRun(part) : part))
    .join('`')
}

// 表の桁揃えを直すためだけの表示幅。全角は 2 桁として数える
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/

function displayWidth(text) {
  let width = 0
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1
  return width
}

function isTableRow(line) {
  const trimmed = line.trim()
  return (
    trimmed.length > 1 &&
    trimmed[0] === '|' &&
    trimmed[trimmed.length - 1] === '|'
  )
}

// | a | b | -> ['a', 'b']。エスケープした \| はセルの区切りにしない
function splitRow(line) {
  const trimmed = line.trim()
  const cells = []
  let cell = ''
  for (let i = 1; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      cell += '\\|'
      i++
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  return cells
}

function isDelimiterRow(cells) {
  return cells.length > 0 && cells.every(c => /^:?-{1,}:?$/.test(c))
}

function padCell(cell, width) {
  return cell + ' '.repeat(Math.max(0, width - displayWidth(cell)))
}

// 区切り行も他の列と同じ幅にする。`:-:` のような寄せ指定は残す
function buildDelimiterCell(cell, width) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const dashes = Math.max(1, width - (left ? 1 : 0) - (right ? 1 : 0))
  return (left ? ':' : '') + '-'.repeat(dashes) + (right ? ':' : '')
}

function leadingIndent(line) {
  const m = line.match(/^[ \t]*/)
  return m ? m[0] : ''
}

/**
 * 空白を詰めると、prettier が入れた表の桁揃えがずれる。詰めた後の幅で組み直す。
 *
 * 対象は文章として扱った行だけ。コードブロックの中に書かれた表や、パイプを含む
 * CLI の出力を組み直してはいけない。行頭の字下げも保つ（リストの中の表を
 * 左端に寄せると、リストから外れる）。
 *
 * 行ごとのセル数が揃っている表だけを対象にする。揃っていないものは、こちらの
 * 読み違いの可能性があるので触らない。
 */
function realignTables(lines, isProse) {
  const out = lines.slice()
  let i = 0
  while (i < out.length) {
    if (!isProse[i] || !isTableRow(out[i])) {
      i++
      continue
    }
    let end = i
    while (
      end + 1 < out.length &&
      isProse[end + 1] &&
      isTableRow(out[end + 1])
    ) {
      end++
    }

    const rows = out.slice(i, end + 1).map(splitRow)
    const sameShape =
      rows.length >= 2 &&
      rows.every(r => r.length === rows[0].length) &&
      isDelimiterRow(rows[1])

    if (sameShape) {
      const widths = rows[0].map((_, col) =>
        Math.max(
          3,
          ...rows.map((r, rowIndex) =>
            rowIndex === 1 ? 0 : displayWidth(r[col])
          )
        )
      )
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r].map((cell, col) =>
          r === 1
            ? buildDelimiterCell(cell, widths[col])
            : padCell(cell, widths[col])
        )
        out[i + r] = leadingIndent(out[i + r]) + '| ' + cells.join(' | ') + ' |'
      }
    }
    i = end + 1
  }
  return out
}

// 行ごとに「文章か、コードか」を決めて、文章の行だけ詰める
function squeezeLines(text) {
  const lines = text.split('\n')
  const isProse = []
  const squeezed = []
  let inFence = false
  let fenceMarker = null

  lines.forEach(line => {
    const fence = line.match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1][0]
      } else if (fence[1][0] === fenceMarker) {
        inFence = false
        fenceMarker = null
      }
      isProse.push(false)
      squeezed.push(line)
      return
    }
    // インデント 4 桁以上はコードブロック
    if (inFence || /^(\t| {4})/.test(line)) {
      isProse.push(false)
      squeezed.push(line)
      return
    }
    isProse.push(true)
    squeezed.push(squeezeLine(line))
  })

  return { lines, isProse, squeezed }
}

/**
 * @param {string} text markdown 全文
 * @returns {string} 日本語と英数字の間の空白を詰めたもの
 */
function squeezeCjkSpacing(text) {
  if (typeof text !== 'string' || text === '') return text
  const { isProse, squeezed } = squeezeLines(text)
  return realignTables(squeezed, isProse).join('\n')
}

/**
 * 詰めた本文と、詰めた後のカーソル位置を返す。
 *
 * カーソルより前だけを別に詰めて長さを測る方法は、表を組み直す時に誤る
 * （列幅はカーソルより下の行にも左右されるため）。1 回の変換の結果から、
 * 行と桁で位置を引き直す。
 *
 * @param {string} text
 * @param {number} cursorOffset 変換前の文字位置
 * @returns {{text: string, cursorOffset: number}}
 */
function squeezeCjkSpacingWithCursor(text, cursorOffset) {
  if (typeof text !== 'string' || text === '') {
    return { text, cursorOffset: cursorOffset || 0 }
  }
  const { lines, isProse, squeezed } = squeezeLines(text)
  const finalLines = realignTables(squeezed, isProse)

  const offset = Math.max(0, Math.min(cursorOffset || 0, text.length))
  let consumed = 0
  let lineIndex = 0
  while (
    lineIndex < lines.length - 1 &&
    consumed + lines[lineIndex].length < offset
  ) {
    consumed += lines[lineIndex].length + 1
    lineIndex++
  }
  const column = offset - consumed

  let newOffset = 0
  for (let i = 0; i < lineIndex; i++) newOffset += finalLines[i].length + 1

  const sameLine = finalLines[lineIndex] === lines[lineIndex]
  if (sameLine) {
    newOffset += column
  } else if (squeezed[lineIndex] === finalLines[lineIndex]) {
    // 詰めただけの行は、同じ規則で行頭からの分を測り直せる
    newOffset += squeezeLine(lines[lineIndex].slice(0, column)).length
  } else {
    // 組み直した表の行。桁の対応は取れないので、行の長さに収める
    newOffset += Math.min(column, finalLines[lineIndex].length)
  }

  return { text: finalLines.join('\n'), cursorOffset: newOffset }
}

module.exports = { squeezeCjkSpacing, squeezeCjkSpacingWithCursor }
