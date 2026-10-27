// 画面の割り付け。範囲と巡回順はデスクトップ版（Main.js・sideNavMode.js）と同じにする
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_LAYOUT,
  LIST,
  NAV,
  SPLIT,
  listPaneWidth,
  navPaneWidth,
  nextPaneMode,
  nextViewMode,
  parseLayout,
  resizeList,
  togglePreview
} from '../src/layout.ts'

test('ペインは 展開 → 畳む → 隠す → 展開 と巡回し、未知の値は展開に戻る', () => {
  assert.equal(nextPaneMode('EXPANDED'), 'FOLDED')
  assert.equal(nextPaneMode('FOLDED'), 'HIDDEN')
  assert.equal(nextPaneMode('HIDDEN'), 'EXPANDED')
  assert.equal(nextPaneMode('???'), 'EXPANDED')
})

test('⌘E は Split と全面プレビューを行き来し、全面エディタからはプレビューへ', () => {
  assert.equal(togglePreview('SPLIT'), 'PREVIEW')
  assert.equal(togglePreview('PREVIEW'), 'SPLIT')
  assert.equal(togglePreview('EDITOR'), 'PREVIEW')
  assert.equal(nextViewMode('EDITOR'), 'SPLIT')
  assert.equal(nextViewMode('SPLIT'), 'PREVIEW')
  assert.equal(nextViewMode('PREVIEW'), 'EDITOR')
})

test('画面に出す幅は、畳むと細く、隠すと 0', () => {
  const l = { ...DEFAULT_LAYOUT, navWidth: 260, listWidth: 280, foldedListWidth: 90 }
  assert.equal(navPaneWidth(l), 260)
  assert.equal(navPaneWidth({ ...l, navMode: 'FOLDED' }), NAV.folded)
  assert.equal(navPaneWidth({ ...l, navMode: 'HIDDEN' }), 0)
  assert.equal(listPaneWidth(l), 280)
  assert.equal(listPaneWidth({ ...l, listMode: 'FOLDED' }), 90)
  assert.equal(listPaneWidth({ ...l, listMode: 'HIDDEN' }), 0)
})

test('ノート一覧のドラッグは範囲に収め、畳んでいるときは畳んだ幅だけを動かす', () => {
  const l = { ...DEFAULT_LAYOUT, listWidth: 280 }
  assert.equal(resizeList(l, 50).listWidth, LIST.min)
  assert.equal(resizeList(l, 9999).listWidth, LIST.max)
  const folded = resizeList({ ...l, listMode: 'FOLDED' }, 150)
  assert.equal(folded.foldedListWidth, 150)
  // 展開したら元の広さに戻るよう、通常の幅は触らない
  assert.equal(folded.listWidth, 280)
  assert.equal(resizeList({ ...l, listMode: 'FOLDED' }, 10).foldedListWidth, LIST.foldedMin)
})

test('保存値は壊れていても既定値で埋め、範囲外は範囲に収める', () => {
  assert.deepEqual(parseLayout(null), DEFAULT_LAYOUT)
  assert.deepEqual(parseLayout('{not json'), DEFAULT_LAYOUT)
  assert.deepEqual(parseLayout('"text"'), DEFAULT_LAYOUT)
  const l = parseLayout(
    JSON.stringify({
      navMode: 'FOLDED',
      navWidth: 10,
      listMode: 'bogus',
      listWidth: 1e6,
      viewMode: 'PREVIEW',
      editorPercent: 99,
      foldedListWidth: 'x'
    })
  )
  assert.equal(l.navMode, 'FOLDED')
  assert.equal(l.navWidth, NAV.min)
  assert.equal(l.listMode, 'EXPANDED')
  assert.equal(l.listWidth, LIST.max)
  assert.equal(l.viewMode, 'PREVIEW')
  assert.equal(l.editorPercent, SPLIT.max)
  assert.equal(l.foldedListWidth, LIST.foldedInitial)
})
