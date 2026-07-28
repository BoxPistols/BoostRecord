import React from 'react'
import renderer from 'react-test-renderer'
import FolderColorSwatches from 'browser/components/FolderColorSwatches'
import consts from 'browser/lib/consts'

// 環境設定のフォルダ編集行は、従来 SketchPicker と全画面を覆う cover div を
// <button> の内側に描いていた。ピッカー操作のクリックがボタンへ伝播し、
// cover が閉じないまま残ると画面全体がクリック不能になる（例外が出ないので
// 「フリーズした」ようにしか見えない）。この共通部品はその構造を持たない。

it('プリセットの色数だけスウォッチを描く', () => {
  const component = renderer.create(
    <FolderColorSwatches value={consts.FOLDER_COLORS[0]} onSelect={jest.fn()} />
  )
  expect(component.root.findAllByType('button').length).toBe(
    consts.FOLDER_COLORS.length
  )
})

it('全画面を覆う fixed の要素を持たない', () => {
  const component = renderer.create(
    <FolderColorSwatches value={null} onSelect={jest.fn()} />
  )
  expect(JSON.stringify(component.toJSON())).not.toMatch(/"position":"fixed"/)
})

it('選んだ色を返し、祖先へ伝播させない', () => {
  const onSelect = jest.fn()
  const component = renderer.create(
    <FolderColorSwatches value={null} onSelect={onSelect} />
  )
  const preventDefault = jest.fn()
  const stopPropagation = jest.fn()
  component.root
    .findAllByType('button')[2]
    .props.onClick({ preventDefault, stopPropagation })

  expect(onSelect).toHaveBeenCalledWith(consts.FOLDER_COLORS[2])
  // 伝播を止めないと、環境設定側では blur -> confirm が走って行が閉じてしまう
  expect(stopPropagation).toHaveBeenCalled()
  expect(preventDefault).toHaveBeenCalled()
})

it('選択中の色だけ aria-pressed が立つ', () => {
  const target = consts.FOLDER_COLORS[3]
  const component = renderer.create(
    <FolderColorSwatches value={target} onSelect={jest.fn()} />
  )
  const pressed = component.root
    .findAllByType('button')
    .filter(b => b.props['aria-pressed'])
  expect(pressed.length).toBe(1)
  expect(pressed[0].props['data-folder-swatch']).toBe(target)
})
