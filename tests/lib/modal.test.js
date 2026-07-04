/**
 * Event-handling regression tests for the modal system.
 *
 * The Preferences modal silently failed to open when openModal() threw on a
 * missing NoteList element: the webpack-era CSS-module selector
 * ('.NoteList__list___browser-main-NoteList-') matches nothing under the
 * Vite build, so `null.style` aborted the handler before setState ran.
 * These tests pin the null-safe behaviour and the stable data-attribute
 * lookup that replaced it.
 */
import React from 'react'

jest.mock('../../browser/main/store', () => ({
  store: {
    getState: () => ({}),
    subscribe: () => () => {},
    dispatch: () => {}
  }
}))

const modal = require('../../browser/main/lib/modal')
const { openModal, closeModal, isModalOpen } = modal

const Dummy = () => React.createElement('div', { id: 'dummy-modal-content' })

afterEach(() => {
  closeModal()
  const list = document.querySelector('[data-note-list]')
  if (list != null) list.remove()
})

it('openModal opens the modal even when the NoteList element is absent', () => {
  expect(document.querySelector('[data-note-list]')).toBeNull()
  expect(() => openModal(Dummy)).not.toThrow()
  expect(isModalOpen()).toBe(true)
  expect(document.querySelector('.ModalBase').className).not.toMatch(/hide/)
  expect(document.querySelector('#dummy-modal-content')).not.toBeNull()
})

it('closeModal closes without throwing when the NoteList element is absent', () => {
  openModal(Dummy)
  expect(() => closeModal()).not.toThrow()
  expect(isModalOpen()).toBe(false)
  expect(document.querySelector('.ModalBase').className).toMatch(/hide/)
})

it('toggles NoteList overflow via the data attribute when present', () => {
  const list = document.createElement('div')
  list.setAttribute('data-note-list', '')
  document.body.appendChild(list)
  openModal(Dummy)
  expect(list.style.overflow).toBe('hidden')
  closeModal()
  expect(list.style.overflow).toBe('auto')
})

it('marks body with data-modal=open while open', () => {
  openModal(Dummy)
  expect(document.body.getAttribute('data-modal')).toBe('open')
})

it('default export exposes open/close/isOpen', () => {
  expect(modal.default.open).toBe(openModal)
  expect(modal.default.close).toBe(closeModal)
  expect(modal.default.isOpen).toBe(isModalOpen)
})
