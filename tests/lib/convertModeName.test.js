import convertModeName from 'browser/lib/convertModeName'

it('maps known CodeMirror mode names to display names', () => {
  expect(convertModeName('ejs')).toBe('Embedded Javascript')
  expect(convertModeName('html_ruby')).toBe('Embedded Ruby')
  expect(convertModeName('objectivec')).toBe('Objective C')
  expect(convertModeName('text')).toBe('Plain Text')
})

it('returns the name unchanged for unknown modes', () => {
  expect(convertModeName('javascript')).toBe('javascript')
  expect(convertModeName('python')).toBe('python')
  expect(convertModeName('')).toBe('')
})
