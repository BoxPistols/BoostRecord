// 公開中の Web 版のセキュリティヘッダー（vercel.json）。
// ブラウザからクラウドへつなぐ口を作らないことを、ここで固定する。
// connect-src を広げる変更は、このテストを書き換える判断を伴う。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const cfg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'vercel.json'), 'utf8')
)
const rule = cfg.headers.find(h => h.source === '/(.*)')
if (!rule) throw new Error('vercel.json に全パス（/(.*)）のヘッダー規則がありません')
const all = rule.headers
const header = key => all.find(h => h.key.toLowerCase() === key.toLowerCase())?.value
const csp = Object.fromEntries(
  header('Content-Security-Policy')
    .split(';')
    .map(s => s.trim().split(/\s+/))
    .map(([k, ...v]) => [k, v])
)

test('外部への送信先が無い（connect-src は自分だけ）', () => {
  assert.deepEqual(csp['connect-src'], ["'self'"])
  assert.deepEqual(csp['form-action'], ["'none'"])
})

test('スクリプトは自分の配るファイルだけ。eval とインラインを許さない', () => {
  assert.deepEqual(csp['script-src'], ["'self'"])
  for (const [k, v] of Object.entries(csp)) {
    assert.ok(!v.includes("'unsafe-eval'"), k)
    if (k !== 'style-src') assert.ok(!v.includes("'unsafe-inline'"), k)
  }
})

test('外部の画像・フォント・埋め込みを読まない（開いたことを外へ知らせない）', () => {
  for (const k of ['img-src', 'font-src', 'default-src']) {
    assert.ok(!csp[k].some(v => v === 'https:' || v === '*' || v.startsWith('http')), k)
  }
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.deepEqual(csp['frame-ancestors'], ["'none'"])
  assert.deepEqual(csp['base-uri'], ["'none'"])
})

test('他のサイトへの埋め込み・型の推測・リファラを止める', () => {
  assert.equal(header('X-Frame-Options'), 'DENY')
  assert.equal(header('X-Content-Type-Options'), 'nosniff')
  assert.equal(header('Referrer-Policy'), 'no-referrer')
})
