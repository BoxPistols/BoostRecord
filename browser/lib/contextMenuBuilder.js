import i18n from 'browser/lib/i18n'
import fs from 'fs'

const remote = require('@electron/remote')
const { Menu } = remote.require('electron')
const { clipboard } = remote.require('electron')
const { shell } = remote.require('electron')
const spellcheck = require('./spellcheck')
const uri2path = require('file-uri-to-path')

// Inline AI writing-assist actions (OpenAI / Gemini). Labels are kept local so
// this module — and its unit test — don't pull in ConfigManager at load time;
// the provider logic is lazy-required only when an action is actually clicked.
const AI_MENU_ITEMS = [
  { key: 'summarize', label: '要約' },
  { key: 'rewrite', label: '書き換え（簡潔・明快）' },
  { key: 'translate', label: '翻訳（EN ⇄ JA）' },
  { key: 'continue', label: '続きを書く' },
  { key: 'explainCode', label: 'コードを説明' }
]

// Runs an AI action over the editor's selection and streams the result into the
// editor (replace the selection, or insert after it, per the action's mode).
function runEditorAiAction(editor, actionKey) {
  if (editor == null) return
  const selected = editor.getSelection()
  if (!selected || !selected.trim()) return

  const aiAssist = require('browser/main/lib/aiAssist')
  const action = aiAssist.AI_ACTIONS[actionKey]
  if (action == null) return

  // Capture selection boundaries before any mutation for rollback on error.
  const selectionFrom = editor.getCursor('from')

  // replace mode: insert a placeholder instead of deleting the selection
  // immediately. On first delta the placeholder is swapped out; on error the
  // original text is restored. This prevents a half-deleted document.
  const PLACEHOLDER = '…' // '…'
  let idx
  let placeholderActive = false

  if (action.mode === 'replace') {
    const selectionTo = editor.getCursor('to')
    editor.replaceRange(PLACEHOLDER, selectionFrom, selectionTo)
    idx = editor.indexFromPos(selectionFrom) // idx = START of placeholder
    placeholderActive = true
  } else {
    const end = editor.getCursor('to')
    editor.setCursor(end)
    if (actionKey !== 'continue') editor.replaceRange('\n\n', end)
    idx = editor.indexFromPos(editor.getCursor())
  }

  const insert = text => {
    if (placeholderActive) {
      // Swap placeholder (1 char) for the first real delta
      const from = editor.posFromIndex(idx)
      const to = editor.posFromIndex(idx + 1) // placeholder is 1 char
      editor.replaceRange(text, from, to)
      idx += text.length // idx was at START; after replace end = start + new length
      placeholderActive = false
    } else {
      editor.replaceRange(text, editor.posFromIndex(idx))
      idx += text.length
    }
    editor.setCursor(editor.posFromIndex(idx))
  }

  aiAssist.runAiAction(actionKey, selected, insert).catch(err => {
    // Rollback: remove everything inserted (placeholder or partial AI text)
    // and restore the original selection text.
    if (action.mode === 'replace') {
      const currentEnd = editor.posFromIndex(placeholderActive ? idx + 1 : idx)
      editor.replaceRange(selected, selectionFrom, currentEnd)
    }
    const message = (err && err.message) || String(err)
    try {
      remote.require('electron').dialog.showErrorBox('AI', message)
    } catch (e) {
      console.error('[AI]', message)
    }
  })
}

/**
 * Creates the context menu that is shown when there is a right click in the editor of a (not-snippet) note.
 * If the word is does not contains a spelling error (determined by the 'error style'), no suggestions for corrections are requested
 * => they are not visible in the context menu
 * @param editor CodeMirror editor
 * @param {MouseEvent} event that has triggered the creation of the context menu
 * @returns {Electron.Menu} The created electron context menu
 */
const buildEditorContextMenu = function(editor, event) {
  if (
    editor == null ||
    event == null ||
    event.pageX == null ||
    event.pageY == null
  ) {
    return null
  }
  const cursor = editor.coordsChar({ left: event.pageX, top: event.pageY })
  const wordRange = editor.findWordAt(cursor)
  const word = editor.getRange(wordRange.anchor, wordRange.head)
  const existingMarks = editor.findMarks(wordRange.anchor, wordRange.head) || []
  let isMisspelled = false
  for (const mark of existingMarks) {
    if (mark.className === spellcheck.getCSSClassName()) {
      isMisspelled = true
      break
    }
  }
  let suggestion = []
  if (isMisspelled) {
    suggestion = spellcheck.getSpellingSuggestion(word)
  }

  const selection = {
    isMisspelled: isMisspelled,
    spellingSuggestions: suggestion
  }
  const template = [
    {
      role: 'cut'
    },
    {
      role: 'copy'
    },
    {
      role: 'paste'
    },
    {
      role: 'selectall'
    }
  ]

  if (selection.isMisspelled) {
    const suggestions = selection.spellingSuggestions
    template.unshift.apply(
      template,
      suggestions
        .map(function(suggestion) {
          return {
            label: suggestion,
            click: function(suggestion) {
              if (editor != null) {
                editor.replaceRange(
                  suggestion.label,
                  wordRange.anchor,
                  wordRange.head
                )
              }
            }
          }
        })
        .concat({
          type: 'separator'
        })
    )
  }
  template.push(
    { type: 'separator' },
    {
      label: 'AI',
      submenu: AI_MENU_ITEMS.map(function(item) {
        return {
          label: item.label,
          click: function() {
            runEditorAiAction(editor, item.key)
          }
        }
      })
    }
  )

  return Menu.buildFromTemplate(template)
}

/**
 * Creates the context menu that is shown when there is a right click Markdown preview of a (not-snippet) note.
 * @param {MarkdownPreview} markdownPreview
 * @param {MouseEvent} event that has triggered the creation of the context menu
 * @returns {Electron.Menu} The created electron context menu
 */
const buildMarkdownPreviewContextMenu = function(markdownPreview, event) {
  if (
    markdownPreview == null ||
    event == null ||
    event.pageX == null ||
    event.pageY == null
  ) {
    return null
  }

  // Default context menu inclusions
  const template = [
    {
      role: 'copy'
    },
    {
      role: 'selectall'
    }
  ]

  if (
    event.target.tagName.toLowerCase() === 'a' &&
    event.target.getAttribute('href')
  ) {
    // Link opener for files on the local system pointed to by href
    const href = event.target.href
    const isLocalFile = href.startsWith('file:')
    if (isLocalFile) {
      const absPath = uri2path(href)
      try {
        if (fs.lstatSync(absPath).isFile()) {
          template.push({
            label: i18n.__('Show in explorer'),
            click: e => shell.showItemInFolder(absPath)
          })
        }
      } catch (e) {
        console.log(
          'Error while evaluating if the file is locally available',
          e
        )
      }
    }

    // Add option to context menu to copy url
    template.push({
      label: i18n.__('Copy Url'),
      click: e => clipboard.writeText(href)
    })
  }
  return Menu.buildFromTemplate(template)
}

// Named exports for ESM consumers; default kept for require().prop callers.
export { buildEditorContextMenu, buildMarkdownPreviewContextMenu }

export default {
  buildEditorContextMenu: buildEditorContextMenu,
  buildMarkdownPreviewContextMenu: buildMarkdownPreviewContextMenu
}
