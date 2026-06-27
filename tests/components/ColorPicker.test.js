import React from 'react'
import renderer from 'react-test-renderer'
import ColorPicker from 'browser/components/ColorPicker'

const baseProps = {
  color: '#ff0000',
  targetRect: { right: 100, top: 50, bottom: 80 },
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
  onReset: jest.fn()
}

it('ColorPicker renders', () => {
  const component = renderer.create(<ColorPicker {...baseProps} />)
  expect(component.toJSON()).toBeTruthy()
})

it('ColorPicker confirms with the current color', () => {
  const onConfirm = jest.fn()
  const component = renderer.create(
    <ColorPicker {...baseProps} onConfirm={onConfirm} />
  )
  component.root.findByProps({ className: 'btn-confirm' }).props.onClick()
  expect(onConfirm).toHaveBeenCalledWith('#ff0000')
})

it('ColorPicker calls onReset and onCancel from their buttons', () => {
  const onReset = jest.fn()
  const onCancel = jest.fn()
  const component = renderer.create(
    <ColorPicker {...baseProps} onReset={onReset} onCancel={onCancel} />
  )
  component.root.findByProps({ className: 'btn-reset' }).props.onClick()
  component.root.findByProps({ className: 'btn-cancel' }).props.onClick()
  expect(onReset).toHaveBeenCalledTimes(1)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it('ColorPicker defaults the color when none is given', () => {
  const onConfirm = jest.fn()
  const component = renderer.create(
    <ColorPicker {...baseProps} color={undefined} onConfirm={onConfirm} />
  )
  component.root.findByProps({ className: 'btn-confirm' }).props.onClick()
  expect(onConfirm).toHaveBeenCalledWith('#939395')
})
