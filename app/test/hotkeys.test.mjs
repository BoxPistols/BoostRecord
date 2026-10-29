import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comboFromEvent, defaultBindings, displayCombo, jumpIndex, matches, parseCombo, problemOf, toCodeMirror, formatCombo
} from '../src/hotkeys.ts'
import { DEFAULT_CONFIG, parseConfig } from '../src/config.ts'

// KeyboardEvent の代わり。必要なものだけ持つ
const ev = (code, mods = {}, key = '') => ({ code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

test('Mac の ⌘ は Mod、Ctrl は Ctrl として読む', () => {
  assert.equal(comboFromEvent(ev('KeyF', { metaKey: true, shiftKey: true }), true), 'Mod+Shift+F')
  assert.equal(comboFromEvent(ev('KeyL', { ctrlKey: true }), true), 'Ctrl+L')
  assert.equal(comboFromEvent(ev('KeyL', { ctrlKey: true }), false), 'Mod+L')
})

test('Option で文字が変わっても（÷ など）キーの位置で読む', () => {
  assert.equal(comboFromEvent(ev('Slash', { metaKey: true, altKey: true }, '÷'), true), 'Mod+Alt+/')
  assert.ok(matches(ev('Slash', { metaKey: true, altKey: true }, '÷'), 'Mod+Alt+/', true))
})

test('修飾キーが多くても少なくても一致しない', () => {
  assert.ok(!matches(ev('KeyF', { metaKey: true, shiftKey: true }), 'Mod+F', true))
  assert.ok(!matches(ev('KeyF', {}), 'Mod+F', true))
})

test('修飾キーだけでは登録しない', () => {
  assert.equal(comboFromEvent(ev('MetaLeft', { metaKey: true }, 'Meta'), true), null)
})

test('CodeMirror の書き方へ直す', () => {
  assert.equal(toCodeMirror('Mod+Shift+F'), 'Mod-Shift-f')
  assert.equal(toCodeMirror('Mod+Alt+ArrowUp'), 'Mod-Alt-ArrowUp')
  assert.equal(toCodeMirror('Ctrl+Shift+/'), 'Ctrl-Shift-/')
})

test('表示は Mac で記号、それ以外で文字', () => {
  assert.equal(displayCombo('Mod+Alt+ArrowDown', true), '⌘⌥↓')
  assert.equal(displayCombo('Mod+Alt+ArrowDown', false), 'Ctrl + Alt + ↓')
})

test('画面の撮影（⌘⇧3〜5）やタブを閉じるキーは登録させない', () => {
  for (const k of ['3', '4', '5']) assert.equal(problemOf(`Mod+Shift+${k}`, true)?.level, 'block')
  assert.equal(problemOf('Mod+W', true)?.level, 'block')
  assert.equal(problemOf('A', true)?.level, 'block')
  assert.equal(problemOf('Shift+A', true)?.level, 'block')
  assert.equal(problemOf('Mod+[', true)?.level, 'warn')
  assert.equal(problemOf('Mod+Alt+ArrowDown', true), null)
})

test('既定のキーはどれも登録できるキーで、互いに重ならない', () => {
  for (const mac of [true, false]) {
    const b = defaultBindings(mac)
    const combos = Object.values(b)
    assert.equal(new Set(combos).size, combos.length)
    for (const c of combos) assert.notEqual(problemOf(c, mac)?.level, 'block', c)
  }
})

test('番号ジャンプ: 1〜9 が 0〜8 番、0 が 9 番。修飾キーが違えば動かない', () => {
  assert.equal(jumpIndex(ev('Digit1', { ctrlKey: true }), 'Ctrl', true), 0)
  assert.equal(jumpIndex(ev('Digit0', { ctrlKey: true }), 'Ctrl', true), 9)
  assert.equal(jumpIndex(ev('Digit1', { metaKey: true }), 'Ctrl', true), null)
  assert.equal(jumpIndex(ev('Digit1', { ctrlKey: true, shiftKey: true }), 'Ctrl', true), null)
  assert.equal(jumpIndex(ev('Digit2', { altKey: true }), 'Alt', false), 1)
})

test('設定: 変えたキーは残り、登録できないキー・重なるキー・壊れた値は既定に戻す', () => {
  const c = parseConfig(JSON.stringify({ hotkey: {
    nextNote: 'Mod+Alt+J', prevNote: 'Mod+Shift+3', newNote: 'Mod+Alt+J', link: 42, jumpModifier: 'Hyper'
  } }))
  // 並び順で先の newNote が Mod+Alt+J を取り、重なった nextNote は既定に戻る
  assert.equal(c.hotkey.newNote, 'Mod+Alt+J')
  assert.equal(c.hotkey.nextNote, DEFAULT_CONFIG.hotkey.nextNote)
  assert.equal(c.hotkey.prevNote, DEFAULT_CONFIG.hotkey.prevNote)
  assert.equal(c.hotkey.link, DEFAULT_CONFIG.hotkey.link)
  assert.equal(c.hotkey.jumpModifier, DEFAULT_CONFIG.hotkey.jumpModifier)
})

test('parseCombo と formatCombo は往復する', () => {
  for (const c of ['Mod+Shift+F', 'Ctrl+L', 'Mod+,', 'Mod+Alt+ArrowUp']) assert.equal(formatCombo(parseCombo(c)), c)
})
