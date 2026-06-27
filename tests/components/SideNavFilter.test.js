import React from 'react'
import renderer from 'react-test-renderer'
import SideNavFilter from 'browser/components/SideNavFilter'

const baseProps = {
  isFolded: false,
  isHomeActive: true,
  isStarredActive: false,
  isTrashedActive: false,
  counterDelNote: 2,
  counterTotalNote: 10,
  counterStarredNote: 3,
  handleAllNotesButtonClick: jest.fn(),
  handleStarredButtonClick: jest.fn(),
  handleTrashedButtonClick: jest.fn(),
  handleFilterButtonContextMenu: jest.fn()
}

it('SideNavFilter renders the All / Starred / Trash buttons', () => {
  const component = renderer.create(<SideNavFilter {...baseProps} />)
  expect(component.toJSON()).toMatchSnapshot()
  expect(component.root.findAllByType('button').length).toBe(3)
})

it('SideNavFilter calls the matching handler for each button', () => {
  const handleAllNotesButtonClick = jest.fn()
  const handleStarredButtonClick = jest.fn()
  const component = renderer.create(
    <SideNavFilter
      {...baseProps}
      handleAllNotesButtonClick={handleAllNotesButtonClick}
      handleStarredButtonClick={handleStarredButtonClick}
    />
  )
  const buttons = component.root.findAllByType('button')
  buttons[0].props.onClick()
  buttons[1].props.onClick()
  expect(handleAllNotesButtonClick).toHaveBeenCalledTimes(1)
  expect(handleStarredButtonClick).toHaveBeenCalledTimes(1)
})
