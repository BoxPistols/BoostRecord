// Regression guard for the ESM/CJS mismatch fixed in v0.16.11.
//
// These modules use `export default {}` (no named exports). Before the fix,
// consumers used require() which in the Vite production build returned
// { default: {...} } instead of the object directly — making all methods
// undefined at runtime. babel-plugin-add-module-exports hid this in Jest.
//
// Tests here use ESM import (the correct pattern) to document and guard
// the expected API surface. If the module accidentally loses its default
// export, or if .default wrapping re-appears, these tests catch it.

import spellcheck from 'browser/lib/spellcheck'

describe('spellcheck: ESM default import API contract', () => {
  it('default import is an object, not wrapped in .default', () => {
    expect(spellcheck).toBeDefined()
    expect(typeof spellcheck).toBe('object')
    // If CJS/ESM mismatch: spellcheck === { default: {...} }, so .default !== undefined
    expect(spellcheck.default).toBeUndefined()
  })

  describe('methods used in CodeEditor.js', () => {
    // setLanguage() is called in componentWillUnmount — was the crash point in v0.16.10
    it('setLanguage is a function', () => {
      expect(typeof spellcheck.setLanguage).toBe('function')
    })
    it('checkWord is a function', () => {
      expect(typeof spellcheck.checkWord).toBe('function')
    })
    it('handleChange is a function', () => {
      expect(typeof spellcheck.handleChange).toBe('function')
    })
    it('checkWholeDocument is a function', () => {
      expect(typeof spellcheck.checkWholeDocument).toBe('function')
    })
  })

  describe('methods used in contextMenuBuilder.js', () => {
    // getCSSClassName() identifies misspelled word marks in the editor
    it('getCSSClassName is a function', () => {
      expect(typeof spellcheck.getCSSClassName).toBe('function')
    })
    // getSpellingSuggestion() powers the right-click correction menu
    it('getSpellingSuggestion is a function', () => {
      expect(typeof spellcheck.getSpellingSuggestion).toBe('function')
    })
  })

  describe('constants', () => {
    it('SPELLCHECK_DISABLED is a non-empty string', () => {
      expect(typeof spellcheck.SPELLCHECK_DISABLED).toBe('string')
      expect(spellcheck.SPELLCHECK_DISABLED.length).toBeGreaterThan(0)
    })
    it('CSS_ERROR_CLASS is a non-empty string', () => {
      expect(typeof spellcheck.CSS_ERROR_CLASS).toBe('string')
      expect(spellcheck.CSS_ERROR_CLASS.length).toBeGreaterThan(0)
    })
  })
})
