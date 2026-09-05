import i18n from 'browser/lib/i18n'
import fs from 'fs'
import spellcheck from './spellcheck'
import { speakText, stopSpeech } from 'browser/main/lib/ttsAssist'
import eventEmitter from 'browser/main/lib/eventEmitter'
import AiChatModal from 'browser/main/modals/AiChatModal'

const remote = require('@electron/remote')
const { Menu } = remote.require('electron')
const { clipboard } = remote.require('electron')
const { shell } = remote.require('electron')
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

// Whole-note actions: no selection required. Result streams into a fresh
// "## 要約 (AI)" / "## 校閲 (AI)" section appended at the end of the note.
// {scope} はメニューを開いた時点の対象で置き換える（「選択範囲 123 文字」か
// 「ノート全体」）。「選択 or 全体」と書くだけでは、どちらに効くのか分からない
const NOTE_AI_MENU_ITEMS = [
  { key: 'summarizeNote', label: 'ページ要約（ノート全体）' },
  { key: 'proofread', label: '校閲して指摘を末尾に足す（{scope}）' },
  {
    key: 'proofreadApply',
    label: '校閲して直接直す（{scope}）'
  },
  {
    key: 'applyReview',
    label: '校閲 (AI) の指摘を本文に反映し、節を消す（ノート全体）'
  },
  { key: 'dedupeNote', label: '重複をまとめる（{scope}）' },
  {
    key: 'convertNote',
    label: 'Apple メモなどの平文を BoostRecord 形式に整形（{scope}）'
  }
]

// 対象の表示。選択があれば文字数つきで「選択範囲」、無ければ「ノート全体」
// テストの偽エディタは getSelection を持たない。無ければ選択なし扱い
function currentSelection(editor) {
  return editor && typeof editor.getSelection === 'function'
    ? editor.getSelection() || ''
    : ''
}

function describeScope(editor) {
  const sel = currentSelection(editor)
  if (sel && sel.trim()) return `選択範囲${sel.length}文字`
  return 'ノート全体'
}

function openAiChat(editor, opts) {
  // modal.js は store（と ConfigManager）を読み込む。単体テストで electron を
  // 触りに行かせないよう、押された時だけ読む。名前付き export なので
  // require でも .default の取り違えは起きない
  const { openModal } = require('browser/main/lib/modal')
  const noteContent = editor != null ? editor.getValue() : ''
  const selection = editor != null ? editor.getSelection() : ''
  // 選択範囲は開いた時点の位置で覚える。適用のたびに終端を更新して、
  // 続けて適用しても同じ場所を置き換え続けられるようにする
  let selFrom = editor != null ? editor.getCursor('from') : null
  let selTo = editor != null ? editor.getCursor('to') : null
  openModal(AiChatModal, {
    noteContent,
    selection,
    // ワンショットの整形（重複をまとめる等）もここを通す。いきなり本文を
    // 置き換えず、差分を見て塊ごとに採用できる窓で確認してから入れる
    initialRequest: opts && opts.initialRequest,
    forceScope: opts && opts.forceScope,
    onApply:
      editor == null
        ? undefined
        : function(scope, text) {
            if (scope === 'selection' && selFrom && selTo) {
              const startIdx = editor.indexFromPos(selFrom)
              editor.replaceRange(text, selFrom, selTo)
              selTo = editor.posFromIndex(startIdx + text.length)
              editor.setSelection(selFrom, selTo)
            } else {
              const last = editor.lastLine()
              editor.replaceRange(
                text,
                { line: 0, ch: 0 },
                { line: last, ch: editor.getLine(last).length }
              )
              selFrom = { line: 0, ch: 0 }
              selTo = editor.posFromIndex(text.length)
            }
          },
    onInsert:
      editor == null
        ? undefined
        : function(text) {
            editor.replaceSelection(text)
            editor.focus()
          }
  })
}

function runNoteAiAction(editor, actionKey) {
  if (editor == null) return
  const aiAssist = require('browser/main/lib/aiAssist')
  const action = aiAssist.AI_ACTIONS[actionKey]
  if (action == null) return

  const selected = editor.getSelection()
  const useSelection =
    action.scope === 'noteOrSelection' && selected && selected.trim()
  const text = useSelection ? selected : editor.getValue()
  if (!text || !text.trim()) return

  const docEnd = () => {
    const line = editor.lastLine()
    return { line, ch: editor.getLine(line).length }
  }
  const headingStartIdx = editor.indexFromPos(docEnd())
  editor.replaceRange('\n\n' + action.heading + '\n\n', docEnd())
  let idx = editor.indexFromPos(docEnd())

  // Show ⏳ immediately after heading while waiting for first token.
  editor.replaceRange('⏳', docEnd())
  idx = editor.indexFromPos(docEnd()) - 1 // idx = position of ⏳
  let headingLoadingActive = true

  const insert = t => {
    if (headingLoadingActive) {
      // Swap ⏳ out for first streamed token.
      editor.replaceRange(
        t,
        editor.posFromIndex(idx),
        editor.posFromIndex(idx + 1)
      )
      idx += t.length
      headingLoadingActive = false
    } else {
      editor.replaceRange(t, editor.posFromIndex(idx))
      idx += t.length
    }
  }

  aiAssist.runAiAction(actionKey, text, insert).catch(err => {
    if (headingLoadingActive) {
      // Nothing streamed: remove the heading block + ⏳.
      editor.replaceRange(
        '',
        editor.posFromIndex(headingStartIdx),
        editor.posFromIndex(idx + 1)
      )
    }
    const message = (err && err.message) || String(err)
    try {
      remote.require('electron').dialog.showErrorBox('AI', message)
    } catch (e) {
      console.error('[AI]', message)
    }
  })
}

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

  // replace mode: insert a loading placeholder immediately. On first delta
  // the placeholder is swapped out; on error the original text is restored.
  const PLACEHOLDER = '⏳'
  let idx
  let placeholderActive = false
  let appendLoadingActive = false
  let insertStartIdx = -1

  if (action.mode === 'replace') {
    const selectionTo = editor.getCursor('to')
    editor.replaceRange(PLACEHOLDER, selectionFrom, selectionTo)
    idx = editor.indexFromPos(selectionFrom) // idx = START of placeholder
    placeholderActive = true
  } else {
    const end = editor.getCursor('to')
    editor.setCursor(end)
    if (actionKey !== 'continue') {
      // Insert ⏳ loading indicator; swap out on first streamed token.
      insertStartIdx = editor.indexFromPos(end)
      editor.replaceRange('\n\n⏳', end)
      idx = editor.indexFromPos(editor.getCursor()) - 1 // position of ⏳
      appendLoadingActive = true
    } else {
      idx = editor.indexFromPos(editor.getCursor())
    }
  }

  const insert = text => {
    if (placeholderActive) {
      // Swap ⏳ (1 char) for the first real delta.
      const from = editor.posFromIndex(idx)
      const to = editor.posFromIndex(idx + 1)
      editor.replaceRange(text, from, to)
      idx += text.length
      placeholderActive = false
    } else if (appendLoadingActive) {
      // Swap ⏳ (1 char) for the first streamed token.
      const from = editor.posFromIndex(idx)
      const to = editor.posFromIndex(idx + 1)
      editor.replaceRange(text, from, to)
      idx += text.length
      appendLoadingActive = false
    } else {
      editor.replaceRange(text, editor.posFromIndex(idx))
      idx += text.length
    }
    editor.setCursor(editor.posFromIndex(idx))
  }

  aiAssist.runAiAction(actionKey, selected, insert).catch(err => {
    // Rollback inserted content on failure.
    if (action.mode === 'replace') {
      const currentEnd = editor.posFromIndex(placeholderActive ? idx + 1 : idx)
      editor.replaceRange(selected, selectionFrom, currentEnd)
    } else if (appendLoadingActive && insertStartIdx >= 0) {
      // Nothing was streamed: remove \n\n⏳ to avoid leaving debris.
      editor.replaceRange(
        '',
        editor.posFromIndex(insertStartIdx),
        editor.posFromIndex(idx + 1)
      )
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
  const scopeText = describeScope(editor)
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
      // 対象は右クリックした時点で決まる。選択があればそれ、無ければノート全体。
      // 先頭に対象を出しておき、各項目のラベルにも同じ語を入れる
      submenu: [
        {
          label: `対象: ${scopeText}`,
          enabled: false
        },
        { type: 'separator' },
        {
          // 決まった型の操作（要約・翻訳等）に当てはまらない用途。
          // 「聞きたいことを聞く」導線がこれまで無かった
          label: 'AIで文章を改善する…',
          click: function() {
            openAiChat(editor)
          }
        },
        { type: 'separator' },
        {
          // 提案を 1 件ずつ見て適用する（Draftline と同じ型）
          label: `改善提案を出す（${scopeText}）`,
          click: function() {
            eventEmitter.emit('detail:suggest')
          }
        },
        { type: 'separator' }
      ].concat(
        AI_MENU_ITEMS.map(function(item) {
          return {
            // 選択範囲だけに効く操作。選択が無いときは押せないことを見せる
            label: item.label + '（選択範囲）',
            enabled: !!currentSelection(editor).trim(),
            click: function() {
              runEditorAiAction(editor, item.key)
            }
          }
        }),
        [{ type: 'separator' }],
        NOTE_AI_MENU_ITEMS.map(function(item) {
          return {
            label: item.label.replace('{scope}', scopeText),
            click: function() {
              const aiAssist = require('browser/main/lib/aiAssist')
              const action = aiAssist.AI_ACTIONS[item.key]
              if (action && action.mode === 'replaceNote') {
                // 本文を直接書き換える操作は、必ず差分の窓を通す
                openAiChat(editor, {
                  initialRequest: action.request,
                  forceScope: action.scope === 'note' ? 'note' : undefined
                })
              } else {
                runNoteAiAction(editor, item.key)
              }
            }
          }
        })
      )
    },
    {
      // エンジンは設定で選ぶ（OS 内蔵の音声 / VOICEVOX）。
      // ラベルに片方だけ書くと、選んでいない方の人に嘘になる
      label: '読み上げ',
      click: function() {
        const text =
          editor.getSelection() || editor.getLine(editor.getCursor().line)
        if (!text || !text.trim()) return
        speakText(text).catch(err => {
          try {
            remote
              .require('electron')
              .dialog.showErrorBox('読み上げ', err.message)
          } catch (e) {
            console.error('[TTS]', err.message)
          }
        })
      }
    },
    {
      // 本文の上に再生バーを出して、ノート全体を最初から読む
      label: 'ノート全体を読み上げ',
      click: function() {
        eventEmitter.emit('detail:readaloud')
      }
    },
    {
      label: '読み上げを止める',
      click: function() {
        stopSpeech()
      }
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
