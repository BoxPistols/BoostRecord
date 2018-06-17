const Typo = require('typo-js')
jest.mock('typo-js')

const systemUnderTest = require('browser/lib/spellcheck')

beforeEach(() => {
  // Clear all instances and calls to constructor and all methods:
  Typo.mockClear()
})

it('should test that checkRange does not marks words that do not contain a typo', function () {
  const testWord = 'testWord'
  const editor = jest.fn()
  editor.getRange = jest.fn(() => testWord)
  editor.markText = jest.fn()
  const range = {anchor: {line: 1, ch: 0}, head: {line: 1, ch: 10}}
  const mockDictionary = jest.fn()
  mockDictionary.check = jest.fn(() => true)
  systemUnderTest.setDictionaryForTestsOnly(mockDictionary)

  systemUnderTest.checkRange(editor, range)

  expect(editor.getRange).toHaveBeenCalledWith(range.anchor, range.head)
  expect(mockDictionary.check).toHaveBeenCalledWith(testWord)
  expect(editor.markText).not.toHaveBeenCalled()
})

it('should test that checkRange should marks words that contain a typo', function () {
  const testWord = 'testWord'
  const editor = jest.fn()
  editor.getRange = jest.fn(() => testWord)
  editor.markText = jest.fn()
  const range = {anchor: {line: 1, ch: 0}, head: {line: 1, ch: 10}}
  const mockDictionary = jest.fn()
  mockDictionary.check = jest.fn(() => false)
  systemUnderTest.setDictionaryForTestsOnly(mockDictionary)

  systemUnderTest.checkRange(editor, range)

  expect(editor.getRange).toHaveBeenCalledWith(range.anchor, range.head)
  expect(mockDictionary.check).toHaveBeenCalledWith(testWord)
  expect(editor.markText).toHaveBeenCalledWith(range.anchor, range.head, {'className': systemUnderTest.CSS_ERROR_CLASS})
})

it('should test that initialize clears all marks', function () {
  const dummyMarks = [
    {clear: jest.fn()},
    {clear: jest.fn()},
    {clear: jest.fn()}
  ]
  const editor = jest.fn()
  editor.getAllMarks = jest.fn(() => dummyMarks)

  systemUnderTest.initialize(editor, systemUnderTest.SPELLCHECK_DISABLED)

  expect(editor.getAllMarks).toHaveBeenCalled()
  for (const dummyMark of dummyMarks) {
    expect(dummyMark.clear).toHaveBeenCalled()
  }
})

it('should test that initialize with DISABLED as a lang argument should not load any dictionary and not check the whole document', function () {
  const editor = jest.fn()
  editor.getAllMarks = jest.fn(() => [])
  const checkWholeDocumentSpy = jest.spyOn(systemUnderTest, 'checkWholeDocument').mockImplementation()

  systemUnderTest.initialize(editor, systemUnderTest.SPELLCHECK_DISABLED)

  expect(Typo).not.toHaveBeenCalled()
  expect(checkWholeDocumentSpy).not.toHaveBeenCalled()
  checkWholeDocumentSpy.mockRestore()
})

it('should test that initialize loads the correct dictionary', function () {
  const editor = jest.fn()
  editor.getAllMarks = jest.fn(() => [])
  const lang = 'de_DE'
  const checkWholeDocumentSpy = jest.spyOn(systemUnderTest, 'checkWholeDocument').mockImplementation()

  expect(Typo).not.toHaveBeenCalled()
  systemUnderTest.initialize(editor, lang)

  expect(Typo).toHaveBeenCalledWith(lang, false, false, expect.anything())
  expect(Typo.mock.calls[0][3].dictionaryPath).toEqual(systemUnderTest.DICTIONARY_PATH)
  expect(Typo.mock.calls[0][3].asyncLoad).toBe(true)
  checkWholeDocumentSpy.mockRestore()
})

it('should test that checkMultiLineRange performs checks for each word in the stated range', function () {
  const dummyText = 'Line1Word1 Line1Word2 Line1Word3\n L2W1\n \nLine4Word1 Line4Word2'
  const ranges = [
    {anchor: {line: 0, ch: 0}, head: {line: 0, ch: 10}},
    {anchor: {line: 0, ch: 11}, head: {line: 0, ch: 11}},
    {anchor: {line: 0, ch: 12}, head: {line: 0, ch: 22}},
    {anchor: {line: 0, ch: 23}, head: {line: 0, ch: 23}},
    {anchor: {line: 0, ch: 24}, head: {line: 0, ch: 34}},
    {anchor: {line: 1, ch: 0}, head: {line: 1, ch: 0}},
    {anchor: {line: 1, ch: 1}, head: {line: 1, ch: 4}},
    {anchor: {line: 2, ch: 0}, head: {line: 2, ch: 0}},
    {anchor: {line: 3, ch: 0}, head: {line: 3, ch: 10}},
    {anchor: {line: 3, ch: 11}, head: {line: 3, ch: 11}},
    {anchor: {line: 3, ch: 12}, head: {line: 3, ch: 22}}
  ]
  const rangeFrom = {line: 0, ch: 0}
  const rangeTo = {line: 3, ch: 22}
  const editor = jest.fn()
  editor.getRange = jest.fn(() => dummyText)
  editor.findWordAt = jest.fn()
  editor.findWordAt.mockReturnValueOnce(ranges[0])
  editor.findWordAt.mockReturnValueOnce(ranges[1])
  editor.findWordAt.mockReturnValueOnce(ranges[2])
  editor.findWordAt.mockReturnValueOnce(ranges[3])
  editor.findWordAt.mockReturnValueOnce(ranges[4])
  editor.findWordAt.mockReturnValueOnce(ranges[5])
  editor.findWordAt.mockReturnValueOnce(ranges[6])
  editor.findWordAt.mockReturnValueOnce(ranges[7])
  editor.findWordAt.mockReturnValueOnce(ranges[8])
  editor.findWordAt.mockReturnValueOnce(ranges[9])
  editor.findWordAt.mockReturnValueOnce(ranges[10])
  const checkRangeSpy = jest.spyOn(systemUnderTest, 'checkRange').mockImplementation()

  systemUnderTest.checkMultiLineRange(systemUnderTest, editor, rangeFrom, rangeTo)

  expect(editor.getRange).toHaveBeenCalledWith(rangeFrom, rangeTo)
  expect(editor.findWordAt).toHaveBeenCalledTimes(11)
  expect(editor.findWordAt.mock.calls[0][0]).toEqual({line: 0, ch: 0})
  expect(editor.findWordAt.mock.calls[1][0]).toEqual({line: 0, ch: 11})
  expect(editor.findWordAt.mock.calls[2][0]).toEqual({line: 0, ch: 12})
  expect(editor.findWordAt.mock.calls[3][0]).toEqual({line: 0, ch: 23})
  expect(editor.findWordAt.mock.calls[4][0]).toEqual({line: 0, ch: 24})
  expect(editor.findWordAt.mock.calls[5][0]).toEqual({line: 1, ch: 0})
  expect(editor.findWordAt.mock.calls[6][0]).toEqual({line: 1, ch: 1})
  expect(editor.findWordAt.mock.calls[7][0]).toEqual({line: 2, ch: 0})
  expect(editor.findWordAt.mock.calls[8][0]).toEqual({line: 3, ch: 0})
  expect(editor.findWordAt.mock.calls[9][0]).toEqual({line: 3, ch: 11})
  expect(editor.findWordAt.mock.calls[10][0]).toEqual({line: 3, ch: 12})
  expect(checkRangeSpy).toHaveBeenCalledTimes(11)
  expect(checkRangeSpy.mock.calls[0][1]).toEqual(ranges[0])
  expect(checkRangeSpy.mock.calls[1][1]).toEqual(ranges[1])
  expect(checkRangeSpy.mock.calls[2][1]).toEqual(ranges[2])
  expect(checkRangeSpy.mock.calls[3][1]).toEqual(ranges[3])
  expect(checkRangeSpy.mock.calls[4][1]).toEqual(ranges[4])
  expect(checkRangeSpy.mock.calls[5][1]).toEqual(ranges[5])
  expect(checkRangeSpy.mock.calls[6][1]).toEqual(ranges[6])
  expect(checkRangeSpy.mock.calls[7][1]).toEqual(ranges[7])
  expect(checkRangeSpy.mock.calls[8][1]).toEqual(ranges[8])
  expect(checkRangeSpy.mock.calls[9][1]).toEqual(ranges[9])
  expect(checkRangeSpy.mock.calls[10][1]).toEqual(ranges[10])

  checkRangeSpy.mockRestore()
})
