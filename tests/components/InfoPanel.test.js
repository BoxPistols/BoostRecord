/**
 * Regression test: the NOTE LINK input used `defaultValue`, which only
 * applies at mount — after navigating to another note the panel kept
 * showing the first-opened note's link. The input must track the
 * `noteLink` prop as a controlled value.
 */
import React from 'react'
import ReactDOM from 'react-dom'
import InfoPanel from 'browser/main/Detail/InfoPanel'

const baseProps = {
  storageName: 'My Storage',
  folderName: 'My Folder',
  updatedAt: '2026-07-05 00:00',
  createdAt: '2026-07-01 00:00',
  exportAsMd: jest.fn(),
  exportAsTxt: jest.fn(),
  exportAsHtml: jest.fn(),
  exportAsPdf: jest.fn(),
  wordCount: 1,
  letterCount: 1,
  type: 'MARKDOWN_NOTE',
  print: jest.fn()
}

it('note link input tracks the noteLink prop across note navigation', () => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  ReactDOM.render(
    <InfoPanel {...baseProps} noteLink='[Theme Update](:note:aaaa-1111)' />,
    container
  )
  const input = container.querySelector('input')
  expect(input.value).toBe('[Theme Update](:note:aaaa-1111)')

  // simulate navigating to another note: same mounted panel, new prop
  ReactDOM.render(
    <InfoPanel {...baseProps} noteLink='[Other Note](:note:bbbb-2222)' />,
    container
  )
  expect(input.value).toBe('[Other Note](:note:bbbb-2222)')

  ReactDOM.unmountComponentAtNode(container)
  container.remove()
})
