// 重複のペイン。完全一致と意味の重複を分けて並べ、各箇所の「移動」でその箇所を渡す
jest.mock('electron', () => ({
  ipcRenderer: { send: jest.fn(), on: jest.fn() },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

import React from 'react'
import renderer, { act } from 'react-test-renderer'
import DuplicatesPane from 'browser/main/Detail/DuplicatesPane'

const exact = [
  {
    kind: 'exact',
    text: '稼働形態はオンライン中心',
    occurrences: [
      { line: 1, start: 7, end: 20, text: '- 稼働形態はオンライン中心' },
      { line: 5, start: 40, end: 53, text: '・稼働形態はオンライン中心' }
    ]
  }
]

function texts(tree, className) {
  return tree.root
    .findAll(n => n.type === 'span' && n.props.className === className)
    .map(n => [].concat(n.props.children).join(''))
}

test('箇所ごとに行番号と本文を出し、移動でその箇所を渡す', () => {
  const onLocate = jest.fn()
  let tree
  act(() => {
    tree = renderer.create(
      <DuplicatesPane
        exactGroups={exact}
        semanticGroups={[]}
        semanticState='running'
        onRun={() => {}}
        onLocate={onLocate}
        onClose={() => {}}
      />
    )
  })
  expect(texts(tree, 'occurrence-line')).toEqual(['Line 2', 'Line 6'])
  const jumps = tree.root.findAll(
    n => n.type === 'button' && n.props.className === 'occurrence-jump'
  )
  act(() => jumps[1].props.onClick())
  expect(onLocate).toHaveBeenCalledWith(exact[0].occurrences[1])
  // AIに確認している間は仮の行を出し、調べ直すボタンは押せない
  expect(
    tree.root.findAll(n => n.props.className === 'skeleton-line')
  ).toHaveLength(3)
  const run = tree.root.find(
    n => n.type === 'button' && n.props.className === 'run-button'
  )
  expect(run.props.disabled).toBe(true)
})

test('意味の重複は理由と一緒に出す', () => {
  let tree
  act(() => {
    tree = renderer.create(
      <DuplicatesPane
        exactGroups={[]}
        semanticGroups={[
          {
            kind: 'semantic',
            reason: '開始時期が2回書かれている',
            occurrences: [
              { line: 0, start: 0, end: 10, text: '開始は11月頃です。' },
              {
                line: 2,
                start: 20,
                end: 34,
                text: '11月ごろから始める予定です。'
              }
            ]
          }
        ]}
        semanticState='done'
        onRun={() => {}}
        onLocate={() => {}}
        onClose={() => {}}
      />
    )
  })
  const why = tree.root.find(
    n => n.type === 'p' && n.props.className === 'card-why'
  )
  expect(why.props.children).toBe('開始時期が2回書かれている')
  expect(texts(tree, 'occurrence-text')).toEqual([
    '開始は11月頃です。',
    '11月ごろから始める予定です。'
  ])
})
