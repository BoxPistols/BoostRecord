import React from 'react'
import renderer from 'react-test-renderer'
import SnippetTab from 'browser/components/SnippetTab'

const baseProps = {
  snippet: { name: 'index', mode: null, content: '', linesHighlighted: [] },
  isActive: false,
  isDeletable: true,
  onClick: jest.fn(),
  onDelete: jest.fn(),
  onRename: jest.fn(),
  onDragStart: jest.fn(),
  onDrop: jest.fn()
}

// CSS Modules のクラス名（identity-obj-proxy で素通しされる）ではなく、
// バッジが約束している DOM 側の条件で引く。styleName を変えても壊れない
const findJumpHint = tree =>
  renderer
    .create(tree)
    .root.findAllByType('span')
    .filter(node => node.props['aria-hidden'] === 'true')

it('SnippetTab renders no jump hint by default', () => {
  expect(findJumpHint(<SnippetTab {...baseProps} />)).toHaveLength(0)
})

it('SnippetTab renders the jump hint badge when one is given', () => {
  const badges = findJumpHint(<SnippetTab {...baseProps} jumpHint={3} />)
  expect(badges).toHaveLength(1)
  expect(badges[0].props.children).toBe(3)
})

it('SnippetTab keeps rendering the jump hint for the active tab', () => {
  const badges = findJumpHint(
    <SnippetTab {...baseProps} isActive jumpHint={1} />
  )
  expect(badges).toHaveLength(1)
})

it('SnippetTab calls onClick when the tab button is pressed', () => {
  const onClick = jest.fn()
  const component = renderer.create(
    <SnippetTab {...baseProps} onClick={onClick} />
  )
  component.root.findByProps({ draggable: 'true' }).props.onClick({})
  expect(onClick).toHaveBeenCalled()
})
