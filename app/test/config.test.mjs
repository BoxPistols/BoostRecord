// 設定の読み込み。保存値が壊れていても、古い・デスクトップ版の形でも、画面が開けること
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, FONT_SIZE, THEMES, parseConfig, themeVariables } from '../src/config.ts'

test('無い・壊れた保存値は既定値', () => {
  assert.deepEqual(parseConfig(null), DEFAULT_CONFIG)
  assert.deepEqual(parseConfig('{not json'), DEFAULT_CONFIG)
  assert.deepEqual(parseConfig('[1,2]'), DEFAULT_CONFIG)
  assert.deepEqual(parseConfig('{"ui":"x","editor":null}'), DEFAULT_CONFIG)
})

test('デスクトップ版と同じ形（数値が文字列）でも読める', () => {
  const c = parseConfig(
    JSON.stringify({
      ui: { theme: 'nord' },
      editor: { fontSize: '16', fontFamily: 'Monaco', indentType: 'tab', indentSize: '4', displayLineNumbers: false },
      preview: { fontSize: '15', fontFamily: 'Lato', breaks: false }
    })
  )
  assert.equal(c.ui.theme, 'nord')
  assert.equal(c.editor.fontSize, 16)
  assert.equal(c.editor.fontFamily, 'Monaco')
  assert.equal(c.editor.indentType, 'tab')
  assert.equal(c.editor.indentSize, 4)
  assert.equal(c.editor.displayLineNumbers, false)
  assert.equal(c.preview.breaks, false)
})

test('範囲外・知らない値は既定値か範囲の端', () => {
  const c = parseConfig(
    JSON.stringify({ ui: { theme: 'solarized-light' }, editor: { fontSize: 999, indentSize: 3, indentType: 'x' }, preview: { fontSize: -1 } })
  )
  assert.equal(c.ui.theme, DEFAULT_CONFIG.ui.theme)
  assert.equal(c.editor.fontSize, FONT_SIZE.max)
  assert.equal(c.editor.indentSize, DEFAULT_CONFIG.editor.indentSize)
  assert.equal(c.editor.indentType, 'space')
  assert.equal(c.preview.fontSize, FONT_SIZE.min)
  // 継承したキーはテーマ名として通さない
  for (const t of ['constructor', 'toString', '__proto__']) {
    assert.equal(parseConfig(JSON.stringify({ ui: { theme: t } })).ui.theme, DEFAULT_CONFIG.ui.theme, t)
  }
})

test('フォント名に CSS の宣言を閉じる文字があれば捨てる', () => {
  for (const bad of ['a; color: red', 'x}body{display:none', '<script>', 'a\\62']) {
    assert.equal(parseConfig(JSON.stringify({ editor: { fontFamily: bad } })).editor.fontFamily, '')
  }
  assert.equal(parseConfig(JSON.stringify({ editor: { fontFamily: '"Fira Code", Menlo' } })).editor.fontFamily, '"Fira Code", Menlo')
})

test('どのテーマも同じ変数をすべて持つ（抜けると前のテーマの色が残る）', () => {
  const keys = Object.keys(themeVariables(DEFAULT_CONFIG)).sort()
  for (const theme of Object.keys(THEMES)) {
    const vars = themeVariables({ ...DEFAULT_CONFIG, ui: { theme } })
    assert.deepEqual(Object.keys(vars).sort(), keys, theme)
    for (const [k, v] of Object.entries(vars)) assert.ok(v !== undefined && v !== '', `${theme} ${k}`)
  }
})

test('デスクトップ版のテーマ名がすべて選べる', () => {
  for (const t of ['dark', 'default', 'dracula', 'monokai', 'nord', 'rockabilly', 'solarized-dark', 'vulcan', 'white']) {
    assert.ok(t in THEMES, t)
  }
})
