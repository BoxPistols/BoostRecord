/**
 * Touch Bar のボタン構成と、click が正しい IPC チャネルへ送ることの検証。
 * electron は __mocks__/electron.js（TouchBar + nativeImage モック）、
 * main-window は webContents.send を記録するだけのフェイクに差し替える。
 */
jest.mock('../../lib/main-window', () => ({
  webContents: { send: jest.fn() }
}))

const fs = require('fs')
const path = require('path')
const { nativeImage } = require('electron')
const mainWindow = require('../../lib/main-window')
const { build, ICON_DIR } = require('../../lib/touchbar-menu')

// action 名 → 期待する send 呼び出し列。1エントリ足すだけで検証が付いてくる
const EXPECTED_SENDS = {
  allNotes: [['list:navigate', '/home']],
  starredNotes: [['list:navigate', '/starred']],
  bookmarks: [['list:navigate', '/bookmarked']],
  tags: [['list:navigate', '/alltags']],
  find: [['detail:find']],
  noteLink: [['detail:focusnotelink']],
  newNote: [['list:navigate', '/home'], ['top:new-note']],
  toggleNoteList: [['sidenav:togglenotelist']],
  toggleInfo: [['detail:toggleinfo']],
  toggleToc: [['detail:toggletoc']],
  toggleMode: [['topbar:togglemodebutton']],
  togglePreview: [['topbar:togglepreviewbutton']]
}

// アイコンで表現するボタン → 期待する accessibilityLabel
const GLYPH_BUTTONS = {
  allNotes: 'すべて',
  starredNotes: 'スター',
  bookmarks: 'ブックマーク',
  tags: 'タグ',
  find: '検索',
  noteLink: 'リンク',
  newNote: '新規'
}

// ポップオーバー内はテキストのまま
const TEXT_BUTTONS = {
  toggleNoteList: '一覧',
  toggleInfo: '情報',
  toggleToc: '目次',
  toggleMode: 'モード',
  togglePreview: 'プレビュー'
}

const ICON_FILES = [
  'all-notes',
  'bookmark',
  'link',
  'new-note',
  'search',
  'star',
  'tag',
  'view'
]

describe('touchbar-menu', () => {
  beforeEach(() => {
    mainWindow.webContents.send.mockClear()
  })

  it('builds a TouchBar with items (Electron 28 の {items} API)', () => {
    const { touchBar } = build()
    // 旧実装は new TouchBar([...]) で items が undefined になり空バーだった
    expect(Array.isArray(touchBar.items)).toBe(true)
    // ボタン7 + spacer2 + popover1
    expect(touchBar.items.length).toBe(10)
    // 頻用が左端、中でも表示ポップオーバーが最左端（実機フィードバックの並び）
    expect(touchBar.items[0].label).toBe('表示')
    expect(touchBar.items[1].accessibilityLabel).toBe('検索')
    expect(touchBar.items[2].accessibilityLabel).toBe('リンク')
  })

  it('表示系トグルは popover のサブバーに入っている', () => {
    const { viewPopover } = build()
    const sub = viewPopover.items.items
    expect(sub.length).toBe(5)
    // プレビューが左端、目次が右端（ユーザー実機フィードバックによる並び）
    expect(sub[0].label).toBe('プレビュー')
    expect(sub[sub.length - 1].label).toBe('目次')
  })

  it('has callable actions (過不足なし)', () => {
    const { buttons, actions } = build()
    expect(Object.keys(actions).sort()).toEqual(
      Object.keys(EXPECTED_SENDS).sort()
    )
    expect(Object.keys(buttons).sort()).toEqual(
      Object.keys(EXPECTED_SENDS).sort()
    )
  })

  describe('アイコン表現', () => {
    it('生成済み PNG が @1x/@2x とも揃っている（コミット漏れ検知）', () => {
      const missing = []
      ICON_FILES.forEach(name => {
        ;['', '@2x'].forEach(suffix => {
          const p = path.join(ICON_DIR, name + suffix + '.png')
          if (!fs.existsSync(p) || fs.statSync(p).size < 100) {
            missing.push(name + suffix + '.png')
          }
        })
      })
      expect(missing).toEqual([])
    })

    it('グリフボタンは template image のアイコンを持ち、ラベルを持たない', () => {
      const { buttons } = build()
      Object.keys(GLYPH_BUTTONS).forEach(name => {
        const b = buttons[name]
        expect(b.icon).toBeTruthy()
        expect(b.icon.isTemplateImage()).toBe(true)
        expect(b.label).toBeUndefined()
        // アイコンだけのボタンは読み上げ用の名前が要る
        expect(b.accessibilityLabel).toBe(GLYPH_BUTTONS[name])
      })
    })

    it('ポップオーバーは表示アイコン + テキストラベル', () => {
      const { viewPopover } = build()
      expect(viewPopover.label).toBe('表示')
      expect(viewPopover.icon).toBeTruthy()
      expect(viewPopover.icon.isTemplateImage()).toBe(true)
    })

    it('ポップオーバー内はテキストのまま', () => {
      const { buttons } = build()
      Object.keys(TEXT_BUTTONS).forEach(name => {
        expect(buttons[name].label).toBe(TEXT_BUTTONS[name])
        expect(buttons[name].icon).toBeUndefined()
      })
    })

    // 絵文字はコミュニケーション用であってデザインではない、という方針。
    // 元に戻す変更をテストで止める。
    // 絵文字の否定リストではなく「使ってよい文字」の許可リストで判定する
    // （否定リストは範囲の取りこぼしで素通りする）。かな・漢字・全角記号・
    // ラテン英数・空白のみ許可 → 👁 🔍 ⭐️ 🔖 🏷 ✎ はすべて弾かれる
    const ALLOWED_LABEL = /^[぀-ヿ一-鿿々-〇a-zA-Z0-9 ]+$/

    it('ラベルに絵文字を使わない', () => {
      const { buttons, viewPopover } = build()
      const labels = Object.values(buttons)
        .map(b => b.label)
        .concat(viewPopover.label)
        .filter(Boolean)
      expect(labels.length).toBeGreaterThan(0)
      expect(labels.filter(l => !ALLOWED_LABEL.test(l))).toEqual([])
    })

    it('アイコンが読めない時はテキストラベルへ退避する', () => {
      const spy = jest.spyOn(nativeImage, 'createFromPath').mockReturnValue({
        isEmpty: () => true,
        setTemplateImage() {}
      })
      try {
        const { buttons, viewPopover } = build()
        Object.keys(GLYPH_BUTTONS).forEach(name => {
          expect(buttons[name].icon).toBeUndefined()
          expect(buttons[name].label).toBe(GLYPH_BUTTONS[name])
        })
        // ポップオーバーはアイコン無しでもラベルで機能する
        expect(viewPopover.icon).toBeUndefined()
        expect(viewPopover.label).toBe('表示')
      } finally {
        spy.mockRestore()
      }
    })
  })

  Object.keys(EXPECTED_SENDS).forEach(name => {
    it(`${name} → ${EXPECTED_SENDS[name].map(c => c[0]).join(' + ')}`, () => {
      build().actions[name]()
      expect(mainWindow.webContents.send.mock.calls).toEqual(
        EXPECTED_SENDS[name]
      )
    })
  })
})
