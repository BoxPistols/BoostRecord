// dataApi -> ConfigManager が読み込み時に electron-config を生成するため、
// app.getPath を持つ electron のモックが要る（aiConnectionTest と同じ事情）
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn()
  },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

import React from 'react'
import renderer from 'react-test-renderer'
import FolderColorModal from 'browser/main/modals/FolderColorModal'
import consts from 'browser/lib/consts'

const baseProps = {
  close: jest.fn(),
  storage: { key: 'storageKey' },
  folder: { key: 'folderKey', name: 'Notes', color: '#E10051' }
}

// 「フォルダの色変更ができなくなった」の切り分け用。描画時に例外を投げると
// モーダルは開いたまま何も出ないので、まず描けることを固定する。
it('例外を投げずに描画できる', () => {
  const component = renderer.create(<FolderColorModal {...baseProps} />)
  expect(component.toJSON()).toBeTruthy()
})

it('プリセットの色数だけスウォッチが出る', () => {
  const component = renderer.create(<FolderColorModal {...baseProps} />)
  // スウォッチ + 「その他の色…」ボタン
  const buttons = component.root.findAllByType('button')
  expect(buttons.length).toBeGreaterThanOrEqual(consts.FOLDER_COLORS.length)
})

it('色が未設定のフォルダでも描画できる', () => {
  const props = Object.assign({}, baseProps, {
    folder: { key: 'f', name: 'NoColor' }
  })
  expect(renderer.create(<FolderColorModal {...props} />).toJSON()).toBeTruthy()
})

it('「その他の色…」でピッカーを開いても描画できる', () => {
  const component = renderer.create(<FolderColorModal {...baseProps} />)
  const custom = component.root
    .findAllByType('button')
    .find(b => /Custom color|その他の色/.test(String(b.props.children)))
  expect(custom).toBeTruthy()
  custom.props.onClick()
  expect(component.toJSON()).toBeTruthy()
})
