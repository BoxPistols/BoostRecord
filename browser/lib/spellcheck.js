import styles from '../components/CodeEditor.styl'

const Typo = require('typo-js')

const CSS_ERROR_CLASS = 'codeEditor-typo'
const SPELLCHECK_DISABLED = 'NONE'
const DICTIONARY_PATH = '../dictionaries'
let dictionary = null

function getAvailableDictionaries () {
  // TODO: l18n
  return [{label: 'Disabeld', value: SPELLCHECK_DISABLED}, {label: 'Deutsch', value: 'de_DE'}]
}

/**
 * Only to be used in the tests :)
 */
function setDictionaryForTestsOnly (newDictionary) {
  dictionary = newDictionary
}

/**
 * @description Initializes the spellcheck. It removes all existing marks of the current editor.
 * If a language was given (i.e. lang !== this.SPELLCHECK_DISABLED) it will load the stated dictionary and use it to check the whole document.
 * @param {Codemirror} editor CodeMirror-Editor
 * @param {String} lang on of the values from getAvailableDictionaries()-Method
 */
function initialize (editor, lang) {
  dictionary = null
  const existingMarks = editor.getAllMarks() || []
  for (const mark of existingMarks) {
    mark.clear()
  }
  if (lang !== SPELLCHECK_DISABLED) {
    dictionary = new Typo(lang, false, false, {
      dictionaryPath: DICTIONARY_PATH, asyncLoad: true, loadedCallback: () =>
        checkWholeDocument(this, editor)
    })
  }
}

/**
 * Checks the whole content of the editor for typos
 * @param thisReference a reference to <code>this</code>. Needed because this is null if called from parent method
 * @param {Codemirror} editor CodeMirror-Editor
 */
function checkWholeDocument (thisReference, editor) {
  const lastLine = editor.lineCount() - 1
  const textOfLastLine = editor.getLine(lastLine) || ''
  const lastChar = textOfLastLine.length
  const from = {line: 0, ch: 0}
  const to = {line: lastLine, ch: lastChar}
  checkMultiLineRange(thisReference, editor, from, to)
}

/**
 * Checks the given range for typos
 * @param thisReference a reference to <code>this</code>. Needed because this is null if called from parent method
 * @param {Codemirror} editor CodeMirror-Editor
 * @param {line, ch} from starting position of the spellcheck
 * @param {line, ch} to end position of the spellcheck
 */
function checkMultiLineRange (thisReference, editor, from, to) {
  const currentText = editor.getRange(from, to) || ''
  const lines = currentText.split('\n')
  for (let l = from.line; l <= to.line; l++) {
    const line = lines[l] || ''
    let w = 0
    if (l === from.line) {
      w = from.ch
    }
    let wEnd = line.length
    if (l === to.line) {
      wEnd = to.ch
    }
    while (w < wEnd) {
      const wordRange = editor.findWordAt({line: l, ch: w})
      thisReference.checkRange(editor, wordRange)
      w += (wordRange.head.ch - wordRange.anchor.ch) + 1
    }
  }
}

/**
 * @description Checks whether a certain range of characters in the editor (i.e. a word) contains a typo.
 * If so the ranged will be marked with the class CSS_ERROR_CLASS.
 * Note: Due to performance considerations, only words with more then 3 signs are checked.
 * @param {Codemirror} editor CodeMirror-Editor
 * @param wordRange Object specifying the range that should be checked.
 * Having the following structure: <code>{anchor: {line: integer, ch: integer}, head: {line: integer, ch: integer}}</code>
 */
function checkRange (editor, wordRange) {
  const word = editor.getRange(wordRange.anchor, wordRange.head)
  if (word == null || word.length <= 3) {
    return
  }
  if (!dictionary.check(word)) {
    editor.markText(wordRange.anchor, wordRange.head, {className: styles[CSS_ERROR_CLASS]})
  }
}

function handleChange (editor, changeObject) {
  /**
   * Returns the range that is smaller (i.e. that is before the other in the editor)
   */
  function getLesserRange (from, to) {
    if (from.line > to.line) {
      from = to
    } else {
      if (from.ch > to.ch) {
        from = to
      }
    }
    return from
  }

  function calcTo (from) {
    let to = {line: from.line, ch: from.ch}
    const changeArray = changeObject.text || ['']
    to.line += changeArray.length - 1
    let charactersInLastLineOfChange = changeArray[changeArray.length - 1].length
    // If the new text is not empty we need to subtract one from the length due to the counting starting at 0
    if (changeArray[changeArray.length - 1] !== '') {
      charactersInLastLineOfChange -= 1
    }
    if (from.line === to.line) {
      to.ch += charactersInLastLineOfChange
    } else {
      to.ch = charactersInLastLineOfChange
    }
    return to
  }

  if (dictionary !== null) {
    let from = getLesserRange(changeObject.from, changeObject.to)
    let to = calcTo(from)

    if (from.line === to.line && from.ch === to.ch) {
      if (changeObject.text[changeObject.text.length - 1] !== '') {
        from.ch -= 1
      }
    }
    const existingMarks = editor.findMarks(from, to) || []
    for (const mark of existingMarks) {
      mark.clear()
    }
    checkMultiLineRange(this, editor, from, to)
  }
}

module.exports = {
  DICTIONARY_PATH,
  CSS_ERROR_CLASS,
  SPELLCHECK_DISABLED,
  getAvailableDictionaries,
  initialize,
  handleChange,
  checkRange,
  checkMultiLineRange,
  checkWholeDocument,
  setDictionaryForTestsOnly
}
