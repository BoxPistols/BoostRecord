import React from 'react'
import renderer from 'react-test-renderer'
import SideNavFilter from 'browser/components/SideNavFilter'

const baseProps = {
  isFolded: false,
  isHomeActive: true,
  isStarredActive: false,
  isBookmarkedActive: false,
  isTrashedActive: false,
  counterDelNote: 2,
  counterTotalNote: 10,
  counterStarredNote: 3,
  counterBookmarkedNote: 4,
  handleAllNotesButtonClick: jest.fn(),
  handleStarredButtonClick: jest.fn(),
  handleBookmarkedButtonClick: jest.fn(),
  handleTrashedButtonClick: jest.fn(),
  handleFilterButtonContextMenu: jest.fn()
}

it('SideNavFilter renders the All / Starred / Bookmark / Trash buttons', () => {
  const component = renderer.create(<SideNavFilter {...baseProps} />)
  expect(component.toJSON()).toMatchSnapshot()
  expect(component.root.findAllByType('button').length).toBe(4)
})

it('SideNavFilter calls the matching handler for each button', () => {
  const handleAllNotesButtonClick = jest.fn()
  const handleStarredButtonClick = jest.fn()
  const handleBookmarkedButtonClick = jest.fn()
  const handleTrashedButtonClick = jest.fn()
  const component = renderer.create(
    <SideNavFilter
      {...baseProps}
      handleAllNotesButtonClick={handleAllNotesButtonClick}
      handleStarredButtonClick={handleStarredButtonClick}
      handleBookmarkedButtonClick={handleBookmarkedButtonClick}
      handleTrashedButtonClick={handleTrashedButtonClick}
    />
  )
  const buttons = component.root.findAllByType('button')
  buttons[0].props.onClick()
  buttons[1].props.onClick()
  buttons[2].props.onClick()
  buttons[3].props.onClick()
  expect(handleAllNotesButtonClick).toHaveBeenCalledTimes(1)
  expect(handleStarredButtonClick).toHaveBeenCalledTimes(1)
  expect(handleBookmarkedButtonClick).toHaveBeenCalledTimes(1)
  expect(handleTrashedButtonClick).toHaveBeenCalledTimes(1)
})

// 連番バッジ（Cmd 長押し）の番号は画面上の並び順と一致していなければならない。
// ゴミ箱は対象外（削除済み一覧へ飛ぶショートカットは要らない）。
it('data-jump-hint は 1..3 でゴミ箱には振られない', () => {
  const component = renderer.create(<SideNavFilter {...baseProps} />)
  const hints = component.root
    .findAllByType('button')
    .map(b => b.props['data-jump-hint'])
  expect(hints).toEqual([1, 2, 3, undefined])
})
