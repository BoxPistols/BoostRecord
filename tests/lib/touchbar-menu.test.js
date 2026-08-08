/**
 * Touch Bar のボタン構成と、click が正しい IPC チャネルへ送ることの検証。
 * electron は __mocks__/electron.js（TouchBar モック）、main-window は
 * webContents.send を記録するだけのフェイクに差し替える。
 */
jest.mock('../../lib/main-window', () => ({
  webContents: { send: jest.fn() }
}))

const mainWindow = require('../../lib/main-window')
const { build } = require('../../lib/touchbar-menu')

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

describe('touchbar-menu', () => {
  beforeEach(() => {
    mainWindow.webContents.send.mockClear()
  })

  it('builds a TouchBar with items (Electron 28 の {items} API)', () => {
    const { touchBar } = build()
    // 頻用(🔍🔗👁表示)が左端（ユーザー実機フィードバックによる並び）
    expect(touchBar.items[0].label).toBe('🔍')
    expect(touchBar.items[1].label).toBe('🔗')
    expect(touchBar.items[2].label).toBe('👁 表示')
    // 旧実装は new TouchBar([...]) で items が undefined になり空バーだった
    expect(Array.isArray(touchBar.items)).toBe(true)
    // ボタン7 + spacer2 + popover1
    expect(touchBar.items.length).toBe(10)
  })

  it('表示系トグルは popover のサブバーに入っている', () => {
    const { viewPopover } = build()
    expect(viewPopover.items.items.length).toBe(5)
  })

  it('has labeled buttons and callable actions (過不足なし)', () => {
    const { buttons, actions } = build()
    Object.values(buttons).forEach(b => {
      expect(typeof b.label).toBe('string')
      expect(b.label.length).toBeGreaterThan(0)
    })
    expect(Object.keys(actions).sort()).toEqual(
      Object.keys(EXPECTED_SENDS).sort()
    )
    expect(Object.keys(buttons).sort()).toEqual(
      Object.keys(EXPECTED_SENDS).sort()
    )
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
