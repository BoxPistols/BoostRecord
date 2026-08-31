// 各ロケールが en に対してどれだけ埋まっているかを数える。
//
// 訳を足す前に、どこから手を付けるかを決めるための道具。
// 実行: node scripts/locale-report.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'locales')
const load = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'))

// 訳さないもの。固有名詞・拡張子・キー名
const NOT_TRANSLATED = new Set([
  'Ctrl', '.md', '.txt', '.html', '.pdf', 'vim', 'emacs',
  'GitHub', 'Twitter', 'BoostRecord', 'Copyright (C) 2017 - 2019 BoostIO', 'JWT'
])

const en = load('en')
const total = Object.keys(en).length
const names = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort()

const rows = names.map(name => {
  const locale = load(name)
  const missing = Object.keys(en).filter(k => !(k in locale))
  // en は値がキーと同じで当たり前なので数えない
  const untranslated =
    name === 'en'
      ? []
      : Object.keys(en).filter(
          k => k in locale && locale[k] === k && !NOT_TRANSLATED.has(k)
        )
  const covered = total - missing.length - untranslated.length
  return { name, missing: missing.length, untranslated: untranslated.length, covered }
})

console.log(`en のキー: ${total}\n`)
console.log('locale    欠落  原文のまま  カバー率')
for (const r of rows) {
  const pct = Math.floor((r.covered * 100) / total)
  console.log(
    `${r.name.padEnd(9)}${String(r.missing).padStart(4)}${String(r.untranslated).padStart(11)}${String(pct + '%').padStart(9)}`
  )
}

const target = process.argv[2]
if (target) {
  const locale = load(target)
  const missing = Object.keys(en).filter(k => !(k in locale))
  console.log(`\n${target} に無いキー (${missing.length} 件):`)
  for (const k of missing) console.log('  ' + JSON.stringify(k))
}
