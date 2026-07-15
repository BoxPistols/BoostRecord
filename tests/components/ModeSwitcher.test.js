import React from 'react'
import renderer from 'react-test-renderer'
import ModeSwitcher from 'browser/main/Detail/ModeSwitcher'

it('ModeSwitcher renders three segments (Editor / Split / Preview)', () => {
  const component = renderer.create(
    <ModeSwitcher viewMode='SPLIT' onChange={jest.fn()} />
  )
  const icons = component.root.findAllByType('i').map(i => i.props.className)
  expect(icons).toEqual(['fa fa-pencil', 'fa fa-columns', 'fa fa-eye'])
})

it('ModeSwitcher calls onChange with the segment key on mouse down', () => {
  const onChange = jest.fn()
  const component = renderer.create(
    <ModeSwitcher viewMode='SPLIT' onChange={onChange} />
  )
  const buttons = component.root.findAllByType('button')
  buttons[0].props.onMouseDown({}) // Editor
  buttons[2].props.onMouseDown({}) // Preview
  expect(onChange.mock.calls[0][0]).toBe('EDITOR')
  expect(onChange.mock.calls[1][0]).toBe('PREVIEW')
})
