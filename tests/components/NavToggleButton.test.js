import React from 'react'
import renderer from 'react-test-renderer'
import NavToggleButton from 'browser/components/NavToggleButton'

it('NavToggleButton renders the collapse icon when not folded', () => {
  const component = renderer.create(
    <NavToggleButton isFolded={false} handleToggleButtonClick={jest.fn()} />
  )
  expect(component.toJSON()).toMatchSnapshot()
  expect(component.root.findByType('i').props.className).toContain(
    'fa-angle-double-left'
  )
})

it('NavToggleButton renders the expand icon when folded', () => {
  const component = renderer.create(
    <NavToggleButton isFolded handleToggleButtonClick={jest.fn()} />
  )
  expect(component.root.findByType('i').props.className).toContain(
    'fa-angle-double-right'
  )
})

it('NavToggleButton calls handleToggleButtonClick when clicked', () => {
  const handleToggleButtonClick = jest.fn()
  const component = renderer.create(
    <NavToggleButton
      isFolded={false}
      handleToggleButtonClick={handleToggleButtonClick}
    />
  )
  component.root.findByType('button').props.onClick({})
  expect(handleToggleButtonClick).toHaveBeenCalledTimes(1)
})
