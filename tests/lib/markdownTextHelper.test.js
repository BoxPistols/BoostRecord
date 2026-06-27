import { strip } from 'browser/lib/markdownTextHelper'

it('strips heading markers', () => {
  expect(strip('# Heading')).toBe('Heading')
  expect(strip('### Sub heading')).toBe('Sub heading')
})

it('strips inline code backticks', () => {
  expect(strip('`code`')).toBe('code')
})

it('strips strikethrough markers', () => {
  expect(strip('~~text~~')).toBe('text')
})

it('strips list markers', () => {
  expect(strip('- item')).toBe('item')
  expect(strip('+ item')).toBe('item')
  expect(strip('1. item')).toBe('item')
})

it('strips link syntax but keeps the label', () => {
  expect(strip('[label](http://example.com)')).toBe('label')
})

it('collapses runs of blank lines', () => {
  expect(strip('a\n\n\n\nb')).toBe('a\n\nb')
})

it('returns the input unchanged when it cannot be processed', () => {
  expect(strip(null)).toBe(null)
})
