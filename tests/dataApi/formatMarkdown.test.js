import formatMarkdown from 'browser/main/lib/dataApi/formatMarkdown'

const note = {
  key: 'n1',
  title: 'My Title',
  tags: ['a', 'b'],
  content: 'body text',
  isTrashed: false
}

it('returns the content unchanged when metadata export is NONE', () => {
  const format = formatMarkdown({
    storagePath: null,
    export: { metadata: 'NONE' }
  })
  expect(format(note, '/tmp/out.md', [])).toBe('body text')
})

it('merges note metadata into the front matter with MERGE_HEADER', () => {
  const format = formatMarkdown({
    storagePath: null,
    export: { metadata: 'MERGE_HEADER' }
  })
  const result = format(note, '/tmp/out.md', [])
  expect(result).toContain('My Title')
  expect(result).toContain('body text')
  // content and isTrashed are excluded from the merged front matter
  expect(result).not.toMatch(/content:/)
})

it('nests note metadata under a variable with MERGE_VARIABLE', () => {
  const format = formatMarkdown({
    storagePath: null,
    export: { metadata: 'MERGE_VARIABLE', variable: 'note' }
  })
  const result = format(note, '/tmp/out.md', [])
  expect(result).toContain('note:')
  expect(result).toContain('My Title')
  expect(result).toContain('body text')
})
