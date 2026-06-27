import React from 'react'
import renderer from 'react-test-renderer'
import ModalEscButton from 'browser/components/ModalEscButton'

it('ModalEscButton renders correctly', () => {
  const component = renderer.create(
    <ModalEscButton handleEscButtonClick={jest.fn()} />
  )
  expect(component.toJSON()).toMatchSnapshot()
})

it('ModalEscButton calls handleEscButtonClick when clicked', () => {
  const handleEscButtonClick = jest.fn()
  const component = renderer.create(
    <ModalEscButton handleEscButtonClick={handleEscButtonClick} />
  )
  component.root.findByType('button').props.onClick()
  expect(handleEscButtonClick).toHaveBeenCalledTimes(1)
})
