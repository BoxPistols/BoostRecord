// 相談モードとスレッドの保存。返答が届き終わるとノートごとのファイルに残り、
// 開き直すと一覧から選べる。保存済みのファイルが読めないときは書かない
jest.mock('electron', () => ({
  ipcRenderer: { send: jest.fn(), on: jest.fn(), removeListener: jest.fn() },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))
jest.mock('../../browser/main/lib/aiAssist', () => ({
  runAiPrompt: jest.fn(() => Promise.resolve('論点は3つあります。'))
}))

import os from 'os'
import fs from 'fs'
import path from 'path'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import AiChatModal from 'browser/main/modals/AiChatModal'
import { runAiPrompt } from 'browser/main/lib/aiAssist'
import { threadsPath, THREADS_DIR } from 'browser/main/lib/dataApi/aiThreads'

function tmpStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-'))
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function mount(storagePath) {
  let tree
  act(() => {
    tree = renderer.create(
      <AiChatModal
        close={() => {}}
        noteContent='本文です。'
        selection=''
        thread={{ storagePath, noteKey: 'note1' }}
      />
    )
  })
  return tree
}

function buttonByText(tree, text) {
  return tree.root.findAll(
    n => n.type === 'button' && [].concat(n.props.children).join('') === text
  )[0]
}

test('相談モードで送ると相談用の指示で頼み、返答のあとスレッドを保存する', async () => {
  const storage = tmpStorage()
  const tree = mount(storage)
  act(() => buttonByText(tree, 'Discuss').props.onClick())
  act(() => {
    tree.root
      .findByType('textarea')
      .props.onChange({ target: { value: '論点を教えて' } })
  })
  act(() => buttonByText(tree, 'Send').props.onClick())
  await act(async () => {
    await flush()
  })
  expect(runAiPrompt.mock.calls[0][0].system).toMatch(/thinking partner/)

  const saved = JSON.parse(fs.readFileSync(threadsPath(storage, 'note1')))
  expect(saved.threads).toHaveLength(1)
  expect(saved.threads[0].mode).toBe('discuss')
  expect(saved.threads[0].title).toBe('論点を教えて')
  expect(saved.threads[0].messages.map(m => m.role)).toEqual([
    'user',
    'assistant'
  ])

  // 開き直すと、一覧に出て選べる
  const again = mount(storage)
  const options = again.root.findAllByType('option')
  expect(options).toHaveLength(2)
  act(() => {
    again.root
      .findByType('select')
      .props.onChange({ target: { value: saved.threads[0].id } })
  })
  expect(
    again.root.findAll(
      n => n.type === 'div' && n.props.className === 'message--user'
    )
  ).toHaveLength(1)
})

test('保存済みのファイルが読めないときは、送っても書かない', async () => {
  const storage = tmpStorage()
  fs.mkdirSync(path.join(storage, THREADS_DIR))
  const file = threadsPath(storage, 'note1')
  fs.writeFileSync(file, '{"threads": [')
  const tree = mount(storage)
  act(() => {
    tree.root
      .findByType('textarea')
      .props.onChange({ target: { value: '直して' } })
  })
  act(() => buttonByText(tree, 'Send').props.onClick())
  await act(async () => {
    await flush()
  })
  expect(fs.readFileSync(file, 'utf8')).toBe('{"threads": [')
  // スレッドの一覧は出さない
  expect(tree.root.findAllByType('select')).toHaveLength(0)
})
