#!/usr/bin/env node
// パレットの全色を地に対して実測する。閾値は palette.json に書いてある。
// 「見た目で決めた」を残さないため、値を触ったら必ずこれを通す。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const p = JSON.parse(readFileSync(join(here, 'palette.json'), 'utf8'))

const luminance = h => {
  const c = h.replace('#', '')
  const ch = i => {
    const v = parseInt(c.substr(i * 2, 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2)
}
export const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function report() {
  const bg = p.contrast.background
  const { text, nonText, dim } = p.contrast.minimums
  const rows = []
  const push = (key, value) => {
    if (p.contrast.exempt.includes(key)) return rows.push({ key, value, min: 0, ratio: contrast(value, bg) })
    const min = p.contrast.nonText.includes(key) ? nonText : p.contrast.dim.includes(key) ? dim : text
    rows.push({ key, value, min, ratio: contrast(value, bg) })
  }
  for (const [k, v] of Object.entries(p.ui)) push('ui.' + k, v.value)
  for (const [k, v] of Object.entries(p.syntax)) push('syntax.' + k, v.value)
  for (const [k, v] of Object.entries(p.ansi)) push('ansi.' + k, v)
  return rows
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = report()
  const failed = rows.filter(r => r.ratio < r.min)
  for (const r of rows) {
    const ok = r.ratio >= r.min
    console.log(`${ok ? 'ok  ' : 'NG  '}${r.key.padEnd(18)} ${r.value}  ${r.ratio.toFixed(2)}:1  ${r.min ? '下限 ' + r.min : '（地の一部）'}`)
  }
  console.log(`\n${rows.length} 色中 ${failed.length} 件が下限割れ`)
  process.exit(failed.length ? 1 : 0)
}
