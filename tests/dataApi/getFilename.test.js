const path = require('path')
const getFilename = require('browser/main/lib/dataApi/getFilename')

it('builds a filename from the note title', () => {
  expect(getFilename({ title: 'My Note' }, 'md', '/out')).toBe(
    path.join('/out', 'My Note.md')
  )
})

it('sanitizes path separators in the title', () => {
  expect(getFilename({ title: 'a/b' }, 'md', '/out')).toBe(
    path.join('/out', 'a_b.md')
  )
})

it('falls back to a default name when the note has no title', () => {
  const result = getFilename({ title: '' }, 'md', '/out')
  expect(result.startsWith(path.join('/out', ''))).toBe(true)
  expect(result.endsWith('.md')).toBe(true)
})

it('deduplicates repeated filenames with an incrementing suffix', () => {
  const deduplicator = {}
  const first = getFilename({ title: 'Dup' }, 'md', '/out', deduplicator)
  const second = getFilename({ title: 'Dup' }, 'md', '/out', deduplicator)
  const third = getFilename({ title: 'Dup' }, 'md', '/out', deduplicator)
  expect(first).toBe(path.join('/out', 'Dup.md'))
  expect(second).toBe(path.join('/out', 'Dup (1).md'))
  expect(third).toBe(path.join('/out', 'Dup (2).md'))
})
