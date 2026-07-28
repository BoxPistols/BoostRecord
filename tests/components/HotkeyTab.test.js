// dataApi 経由で electron-config が読み込まれるためモックが要る
jest.mock('electron', () => ({
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    // HotkeyTab は addListener / removeListener を使う
    addListener: jest.fn(),
    removeListener: jest.fn()
  },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

import React from 'react'
import renderer from 'react-test-renderer'
import HotkeyTab from 'browser/main/modals/PreferencesModal/HotkeyTab'

// 「効かないホットキー」として報告された2つは、キーの問題ではなく機能自体が
// 環境や設定で働かないものだった。設定画面に出したままだと、利用者は
// キーの割り当てを疑い続けることになる。
//   - Show/Hide Menu Bar: macOS はメニューバーが OS 管理（Win/Linux 専用）
//   - Toggle Direction: config.editor.rtlEnabled が有効な時だけ働く
const baseConfig = {
  hotkey: {
    toggleMain: 'Command + Alt + L',
    toggleNoteList: 'Command + Shift + B',
    toggleInfo: 'Command + Shift + I',
    focusNoteLink: 'Command + Shift + C',
    toggleMode: 'Command + Shift + E',
    togglePreview: 'Command + E',
    toggleDirection: 'Command + Shift + D',
    deleteNote: 'Command + Shift + Backspace',
    pasteSmartly: 'Command + Shift + V',
    prettifyMarkdown: 'Command + Shift + F',
    toggleMenuBar: 'Command + Shift + M',
    insertDate: 'Command + /',
    insertDateTime: 'Command + Alt + /'
  },
  editor: { rtlEnabled: false }
}

const render = config =>
  renderer.create(
    <HotkeyTab
      config={config}
      haveToSave={jest.fn()}
      dispatch={jest.fn()}
      keymap={{}}
    />,
    { createNodeMock: () => ({ focus: () => {}, select: () => {}, value: '' }) }
  )

const labels = component => JSON.stringify(component.toJSON())

it('RTL が無効なら「表示方向の切替」の行を出さない', () => {
  expect(labels(render(baseConfig))).not.toMatch(/Toggle Direction/)
})

it('RTL が有効なら「表示方向の切替」の行を出す', () => {
  const config = Object.assign({}, baseConfig, {
    editor: { rtlEnabled: true }
  })
  expect(labels(render(config))).toMatch(/Toggle Direction/)
})

it('動作する項目は環境にかかわらず出る', () => {
  const json = labels(render(baseConfig))
  expect(json).toMatch(/Toggle Note List/)
  expect(json).toMatch(/Toggle Info Panel/)
  expect(json).toMatch(/Copy Note Link/)
})
