// dataApi -> ConfigManager が読み込み時に electron-config を生成するため、
// app.getPath を持つ electron のモックが要る
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
import RenameFolderModal from 'browser/main/modals/RenameFolderModal'
import consts from 'browser/lib/consts'

const baseProps = {
  close: jest.fn(),
  storage: { key: 's' },
  folder: { key: 'f', name: 'MayApp', color: '#B013A4' }
}

// componentDidMount が this.refs.name.focus() を呼ぶ。react-test-renderer は
// 実 DOM を作らないので、ref に返すダミーを渡す
const options = {
  createNodeMock: () => ({ focus: () => {}, select: () => {} })
}

const render = () =>
  renderer.create(<RenameFolderModal {...baseProps} />, options)

it('例外を投げずに描画できる', () => {
  expect(render().toJSON()).toBeTruthy()
})

// 12 色を 1 行に並べる独自実装がモーダルの最大幅(340px)を超えて押し広げ、
// 全画面に見える不具合があった。折り返す共通部品を使い続けることを固定する。
it('色見本は折り返す共通部品を使う（1行に並べない）', () => {
  const component = render()
  const swatches = component.root
    .findAllByType('button')
    .filter(b => b.props['data-folder-swatch'])
  expect(swatches.length).toBe(consts.FOLDER_COLORS.length)

  // 共通部品は grid。1行に流し込む flex コンテナが残っていないこと
  const json = JSON.stringify(component.toJSON())
  expect(json).toMatch(/"display":"grid"/)
})

it('選択中の色にだけ aria-pressed が立つ', () => {
  const component = render()
  const pressed = component.root
    .findAllByType('button')
    .filter(b => b.props['aria-pressed'])
  expect(pressed.length).toBe(1)
  expect(pressed[0].props['data-folder-swatch']).toBe('#B013A4')
})
