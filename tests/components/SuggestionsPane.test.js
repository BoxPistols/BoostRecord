// 改善提案のカードが描画できること。styleNameに2つのクラスを並べると
// 描画時に例外になり、ビルドもほかのテストも通ったまま提案が出た瞬間に壊れる
jest.mock('electron', () => ({
  ipcRenderer: { send: jest.fn(), on: jest.fn() },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

import React from 'react'
import renderer, { act } from 'react-test-renderer'
import SuggestionsPane from 'browser/main/Detail/SuggestionsPane'

test('提案のカードを種類の札つきで描画できる', () => {
  let tree
  act(() => {
    tree = renderer.create(
      <SuggestionsPane
        suggestions={[
          {
            id: 0,
            type: 'clarity',
            original: 'まずは検証に使えるものを早く形にし、',
            suggestion: 'まず検証に使えるものを早く形にし、',
            explanation: '「は」が続いて読みにくい',
            status: 'pending'
          }
        ]}
        analyzing={false}
        error={null}
        category='all'
        scopeLabel='ノート全体'
        onCategory={() => {}}
        onAnalyze={() => {}}
        onApply={() => {}}
        onDismiss={() => {}}
        onApplyAll={() => {}}
        onClose={() => {}}
      />
    )
  })
  expect(
    tree.root.findAll(n => n.props.className === 'chip--clarity')
  ).toHaveLength(1)
})
