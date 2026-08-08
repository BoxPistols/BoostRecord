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

describe('touchbar-menu', () => {
  beforeEach(() => {
    mainWindow.webContents.send.mockClear()
  })

  it('builds a TouchBar with items (Electron 28 の {items} API)', () => {
    const { touchBar } = build()
    // 旧実装は new TouchBar([...]) で items が undefined になり空バーだった
    expect(Array.isArray(touchBar.items)).toBe(true)
    expect(touchBar.items.length).toBe(7)
  })

  it('has labeled buttons and callable actions', () => {
    const { buttons, actions } = build()
    Object.values(buttons).forEach(b => {
      expect(typeof b.label).toBe('string')
      expect(b.label.length).toBeGreaterThan(0)
    })
    Object.values(actions).forEach(fn => {
      expect(typeof fn).toBe('function')
    })
    expect(Object.keys(buttons).sort()).toEqual(Object.keys(actions).sort())
  })

  it('allNotes → list:navigate /home', () => {
    build().actions.allNotes()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'list:navigate',
      '/home'
    )
  })

  it('starredNotes → list:navigate /starred', () => {
    build().actions.starredNotes()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'list:navigate',
      '/starred'
    )
  })

  it('trash → list:navigate /trashed', () => {
    build().actions.trash()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'list:navigate',
      '/trashed'
    )
  })

  it('find → detail:find', () => {
    build().actions.find()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('detail:find')
  })

  it('newNote → /home へ移動してから top:new-note', () => {
    build().actions.newNote()
    const calls = mainWindow.webContents.send.mock.calls
    expect(calls).toEqual([['list:navigate', '/home'], ['top:new-note']])
  })
})
