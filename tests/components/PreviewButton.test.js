import React from 'react'
import renderer from 'react-test-renderer'
import PreviewButton from 'browser/main/Detail/PreviewButton'

it('PreviewButton shows the eye-slash icon when inactive', () => {
  const component = renderer.create(
    <PreviewButton onClick={jest.fn()} active={false} />
  )
  expect(component.root.findByType('i').props.className).toContain(
    'fa-eye-slash'
  )
})

it('PreviewButton shows the (open) eye icon when active', () => {
  const component = renderer.create(
    <PreviewButton onClick={jest.fn()} active />
  )
  const className = component.root.findByType('i').props.className
  expect(className).toContain('fa-eye')
  // fa-eye-slash also contains "fa-eye" as a substring, so assert it is NOT that
  expect(className).not.toContain('fa-eye-slash')
})

it('PreviewButton reflects the active state via data-active', () => {
  const active = renderer.create(<PreviewButton onClick={jest.fn()} active />)
  expect(active.root.findByType('button').props['data-active']).toBe('true')

  const inactive = renderer.create(
    <PreviewButton onClick={jest.fn()} active={false} />
  )
  expect(inactive.root.findByType('button').props['data-active']).toBe('false')
})

it('PreviewButton calls onClick on mouse down (toolbar buttons use onMouseDown)', () => {
  const onClick = jest.fn()
  const component = renderer.create(
    <PreviewButton onClick={onClick} active={false} />
  )
  component.root.findByType('button').props.onMouseDown({})
  expect(onClick).toHaveBeenCalledTimes(1)
})
