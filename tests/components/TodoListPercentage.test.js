import React from 'react'
import renderer from 'react-test-renderer'
import TodoListPercentage from 'browser/components/TodoListPercentage'

it('TodoListPercentage renders the percentage bar', () => {
  const component = renderer.create(
    <TodoListPercentage
      percentageOfTodo={42}
      onClearCheckboxClick={jest.fn()}
    />
  )
  expect(component.toJSON()).toMatchSnapshot()
})

it('TodoListPercentage is visible for a numeric percentage', () => {
  const tree = renderer
    .create(
      <TodoListPercentage
        percentageOfTodo={42}
        onClearCheckboxClick={jest.fn()}
      />
    )
    .toJSON()
  expect(tree.props.style.display).toBe('')
})

it('TodoListPercentage is hidden when the percentage is NaN', () => {
  const tree = renderer
    .create(
      <TodoListPercentage
        percentageOfTodo={NaN}
        onClearCheckboxClick={jest.fn()}
      />
    )
    .toJSON()
  expect(tree.props.style.display).toBe('none')
})
