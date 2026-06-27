import React from 'react'
import renderer from 'react-test-renderer'
import TodoProcess from 'browser/components/TodoProcess'

it('TodoProcess renders the progress for a partially completed list', () => {
  const component = renderer.create(
    <TodoProcess todoStatus={{ total: 4, completed: 1 }} />
  )
  expect(component.toJSON()).toMatchSnapshot()
})

it('TodoProcess is visible when there is at least one todo', () => {
  const tree = renderer
    .create(<TodoProcess todoStatus={{ total: 4, completed: 1 }} />)
    .toJSON()
  expect(tree.props.style.display).toBe('')
})

it('TodoProcess is hidden when there are no todos', () => {
  const tree = renderer
    .create(<TodoProcess todoStatus={{ total: 0, completed: 0 }} />)
    .toJSON()
  expect(tree.props.style.display).toBe('none')
})
