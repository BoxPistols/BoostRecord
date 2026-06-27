import React from 'react'
import renderer from 'react-test-renderer'
import NoteItemSimple from 'browser/components/NoteItemSimple'

const baseNote = {
  key: 'note-1',
  type: 'MARKDOWN_NOTE',
  title: 'My note',
  storage: 'storage-1'
}

const baseProps = {
  isActive: false,
  isAllNotesView: false,
  note: baseNote,
  handleNoteClick: jest.fn(),
  handleNoteContextMenu: jest.fn(),
  handleDragStart: jest.fn(),
  pathname: '/home',
  storage: { name: 'Storage' }
}

it('NoteItemSimple renders a markdown note', () => {
  const component = renderer.create(<NoteItemSimple {...baseProps} />)
  expect(component.toJSON()).toMatchSnapshot()
})

it('NoteItemSimple uses the active class when active', () => {
  const active = renderer
    .create(<NoteItemSimple {...baseProps} isActive />)
    .toJSON()
  expect(active.props.className).toBe('item-simple--active')

  const inactive = renderer.create(<NoteItemSimple {...baseProps} />).toJSON()
  expect(inactive.props.className).toBe('item-simple')
})

it('NoteItemSimple calls handleNoteClick with the note key', () => {
  const handleNoteClick = jest.fn()
  const component = renderer.create(
    <NoteItemSimple {...baseProps} handleNoteClick={handleNoteClick} />
  )
  component.root.findByProps({ draggable: 'true' }).props.onClick({})
  expect(handleNoteClick).toHaveBeenCalledWith({}, 'note-1')
})
