import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SnippetNoteDetail.styl'
import CodeEditor from 'browser/components/CodeEditor'
import MarkdownEditor from 'browser/components/MarkdownEditor'
import StarButton from './StarButton'
import TagSelect from './TagSelect'
import FolderSelect from './FolderSelect'
import dataApi from 'browser/main/lib/dataApi'
import ee from 'browser/main/lib/eventEmitter'
import CodeMirror from 'codemirror'
import 'codemirror-mode-elixir'
import SnippetTab from 'browser/components/SnippetTab'
import StatusBar from '../StatusBar'
import context from 'browser/lib/context'
import ConfigManager from 'browser/main/lib/ConfigManager'
import _ from 'lodash'
import { findNoteTitle } from 'browser/lib/findNoteTitle'
import AwsMobileAnalyticsConfig from 'browser/main/lib/AwsMobileAnalyticsConfig'
import TrashButton from './TrashButton'
import RestoreButton from './RestoreButton'
import PermanentDeleteButton from './PermanentDeleteButton'
import InfoButton from './InfoButton'
import FontSizeControl from './FontSizeControl'
import ZoomManager from 'browser/main/lib/ZoomManager'
import InfoPanel from './InfoPanel'
import InfoPanelTrashed from './InfoPanelTrashed'
import { formatDate } from 'browser/lib/date-formatter'
import i18n from 'browser/lib/i18n'
import { confirmDeleteNote } from 'browser/lib/confirmDeleteNote'
import markdownToc from 'browser/lib/markdown-toc-generator'
import queryString from 'query-string'
import { replace } from 'connected-react-router'
import {
  subscribe as subscribeMetaKey,
  getJumpNumber,
  MAX_JUMP_TARGETS
} from 'browser/lib/metaKeyHold'

const electron = require('electron')
const remote = require('@electron/remote')
const { dialog } = remote

// description は既定で1行に畳む。展開時の高さは従来どおり 50px。
// タブ・エディタの top は .styl 側で CSS 変数から引くので、ここだけ見れば足りる
const DESCRIPTION_EXPANDED_HEIGHT = 50
// 畳んだ高さの計算に使うので、textarea の line-height もここから当てる
// (.styl 側に書くと数字が2箇所に散り、片方だけ変えると1行目が欠ける)
const DESCRIPTION_LINE_HEIGHT = 1.6
// textarea の padding(2px * 2) + border(1px * 2) + 折り返し防止の余白
const DESCRIPTION_CHROME_HEIGHT = 8
const DESCRIPTION_GAP = 20
const DESCRIPTION_GAP_COLLAPSED = 12

/**
 * 修飾キー + Shift + [ / ] を「左へ(-1) / 右へ(+1) / 該当なし(0)」に落とす。
 * @param {KeyboardEvent} e
 * @returns {number}
 */
function getBracketDirection(e) {
  const isSuper = global.process.platform === 'darwin' ? e.metaKey : e.ctrlKey
  if (!isSuper || !e.shiftKey || e.altKey) return 0
  if (e.code === 'BracketLeft' || e.keyCode === 219) return -1
  if (e.code === 'BracketRight' || e.keyCode === 221) return 1
  return 0
}

// SNIPPET_NOTE は「タブが最低1個ある」前提で描画される。過去の保存不具合で
// snippets: [] のファイルが実在するため、state に入れる前に必ずここを通す
function normalizeSnippets(snippets) {
  const normalized = (Array.isArray(snippets) ? snippets : []).map(snippet =>
    Object.assign({ linesHighlighted: [] }, snippet)
  )
  return normalized.length > 0
    ? normalized
    : [{ name: '', mode: null, content: '', linesHighlighted: [] }]
}

class SnippetNoteDetail extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      // 情報パネルの表示。DOM 直書きだと再描画で閉じてしまう
      isInfoPanelOpen: false,
      isMovingNote: false,
      snippetIndex: 0,
      showArrows: false,
      enableLeftArrow: false,
      enableRightArrow: false,
      // 修飾キー長押し中にタブへ 1..9 の連番バッジを出す（詳細ペインにフォーカスがある時だけ）
      showJumpHints: false,
      // description は既定で畳む。トグルで固定展開、フォーカス中は一時展開
      isDescriptionPinned: false,
      isDescriptionFocused: false,
      note: Object.assign(
        {
          description: ''
        },
        props.note,
        {
          snippets: normalizeSnippets(props.note.snippets)
        }
      )
    }

    this.scrollToNextTabThreshold = 0.7
    this.generateToc = () => this.handleGenerateToc()
    // hotkey.togglePreview(既定 Cmd/Ctrl+E)。アクティブなタブが
    // Markdown のときだけ editor ↔ preview を切り替える
    this.togglePreviewHandler = () => this.handleTogglePreviewShortcut()
  }

  componentDidMount() {
    // ホットキーの受け口は Markdown 側だけにあり、スニペットノートを開いて
    // いる間は情報パネル・リンクのショートカットが効かなかった
    this.toggleInfoHandler = () => this.handleInfoButtonClick()
    this.focusNoteLinkHandler = () => this.focusNoteLink()
    ee.on('detail:toggleinfo', this.toggleInfoHandler)
    ee.on('detail:focusnotelink', this.focusNoteLinkHandler)
    ee.on('topbar:togglepreviewbutton', this.togglePreviewHandler)

    const visibleTabs = this.visibleTabs
    const allTabs = this.allTabs

    if (visibleTabs.offsetWidth < allTabs.scrollWidth) {
      this.setState({
        showArrows: visibleTabs.offsetWidth < allTabs.scrollWidth,
        enableRightArrow:
          allTabs.offsetLeft !== visibleTabs.offsetWidth - allTabs.scrollWidth,
        enableLeftArrow: allTabs.offsetLeft !== 0
      })
    }
    ee.on('code:generate-toc', this.generateToc)

    // 詳細ペインにフォーカスが無い時に出すと、押した数字が一覧・サイドバーの
    // どれに効くのか分からなくなる。タブが1枚だけの時も出さない
    this.unsubscribeMetaKey = subscribeMetaKey(held => {
      const focused = this.hasDetailFocus()
      const tabs = this.state.note.snippets.length
      const next = held && focused && tabs > 1
      // 「バッジが出ない」時に、通知が来ていないのか条件で降りたのかを
      // 実機で切り分けられるようにする（undefined なら通知自体が来ていない）
      window.__tbSnippetJumpHints = { held, focused, tabs, next }
      if (next !== this.state.showJumpHints) {
        this.setState({ showJumpHints: next })
      }
    })
  }

  hasDetailFocus() {
    const root = this.detailRoot
    if (!root || root.offsetParent === null) return false
    return (
      root === document.activeElement || root.contains(document.activeElement)
    )
  }

  componentDidUpdate(prevProps, prevState) {
    // description の開閉でエディタの高さが変わる。CodeMirror はコンテナの
    // サイズ変化を自前で検知しないので、resize を投げて再計測させる
    if (
      this.isDescriptionExpanded(prevState) !== this.isDescriptionExpanded()
    ) {
      window.dispatchEvent(new window.Event('resize'))
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (
      nextProps.note.key !== this.props.note.key &&
      !this.state.isMovingNote
    ) {
      if (this.saveQueue != null) this.saveNow()
      const nextNote = Object.assign(
        {
          description: ''
        },
        nextProps.note,
        {
          snippets: normalizeSnippets(nextProps.note.snippets)
        }
      )

      this.setState(
        {
          snippetIndex: 0,
          // ノートを切り替えたら description は既定（畳んだ状態）に戻す
          isDescriptionPinned: false,
          isDescriptionFocused: false,
          note: nextNote
        },
        () => {
          const { snippets } = this.state.note
          snippets.forEach((snippet, index) => {
            this.refs['code-' + index].reload()
          })
          if (this.refs.tags) this.refs.tags.reset()
          this.setState(this.getArrowsState())
        }
      )
    }
  }

  componentWillUnmount() {
    if (this.saveQueue != null) this.saveNow()
    ee.off('code:generate-toc', this.generateToc)
    ee.off('detail:toggleinfo', this.toggleInfoHandler)
    ee.off('detail:focusnotelink', this.focusNoteLinkHandler)
    ee.off('topbar:togglepreviewbutton', this.togglePreviewHandler)
    if (this.unsubscribeMetaKey) this.unsubscribeMetaKey()
  }

  /** 情報パネルを開いてノートリンクを選択・コピーする（Markdown 側と同じ） */
  focusNoteLink() {
    window.__tbNoteLink = { called: true, at: Date.now() }
    this.setState({ isInfoPanelOpen: true })
    setTimeout(() => {
      const input = document.querySelector('[data-note-link]')
      if (!input) return
      // コピーが先。copy-to-clipboard は一時要素にフォーカスを奪う
      if (this.infoPanelRef && this.infoPanelRef.copyNoteLink) {
        this.infoPanelRef.copyNoteLink()
      }
      input.select()
      // copy-to-clipboard が作る一時要素の後始末とフォーカス移動が
      // 環境によって遅れる（Linux で activeElement が戻らなかった）。
      // もう一度キューに載せて確実に自分へ戻す
      setTimeout(() => {
        input.focus()
        input.select()
      }, 0)
    }, 0)
  }

  /**
   * アクティブなタブが Markdown 系のときだけ editor ↔ preview を切り替える。
   * それ以外のタブでは何もしない(コードに「プレビュー」は無い)
   */
  handleTogglePreviewShortcut() {
    const { note, snippetIndex } = this.state
    const snippet = note.snippets[snippetIndex]
    if (!snippet) return
    if (
      snippet.mode === 'Markdown' ||
      snippet.mode === 'GitHub Flavored Markdown'
    ) {
      const editor = this.refs['code-' + snippetIndex]
      if (editor && editor.togglePreview) editor.togglePreview()
    }
  }

  handleGenerateToc() {
    const { note, snippetIndex } = this.state
    const snippet = note.snippets[snippetIndex]
    // mode は null(Auto Detect)があり得る
    if (snippet && snippet.mode && snippet.mode.includes('Markdown')) {
      const currentEditor = this.refs[`code-${snippetIndex}`].refs.code.editor
      markdownToc.generateInEditor(currentEditor)
    }
  }

  handleChange(e) {
    const { note } = this.state

    if (this.refs.tags) note.tags = this.refs.tags.value
    note.description = this.refs.description.value
    note.updatedAt = new Date()
    note.title = findNoteTitle(note.description, false)

    this.setState(
      {
        note
      },
      () => {
        this.save()
      }
    )
  }

  save() {
    clearTimeout(this.saveQueue)
    this.saveQueue = setTimeout(() => {
      this.saveNow()
    }, 1000)
  }

  saveNow() {
    const { note, dispatch } = this.props
    clearTimeout(this.saveQueue)
    this.saveQueue = null

    // handleFolderChange がディスクへの書き込み完了を待てるよう、
    // 進行中の保存を Promise として持つ
    this.savePromise = dataApi
      .updateNote(note.storage, note.key, this.state.note)
      .then(note => {
        dispatch({
          type: 'UPDATE_NOTE',
          note: note
        })
        AwsMobileAnalyticsConfig.recordDynamicCustomEvent('EDIT_NOTE')
      })
    return this.savePromise
  }

  handleFolderChange(e) {
    const { note } = this.state
    const value = this.refs.folder.value
    const splitted = value.split('-')
    const newStorageKey = splitted.shift()
    const newFolderKey = splitted.shift()

    // moveNote はディスクのファイルを読み直すので、保留中の編集の
    // 「書き込み完了」を待ってから移動する。saveNow() を開始しただけでは
    // moveNote が旧内容を読む競合が残り、移動後のノートが巻き戻る
    const pendingSave =
      this.saveQueue != null
        ? this.saveNow()
        : this.savePromise || Promise.resolve()

    pendingSave
      // 保存失敗時も移動自体は従来どおり通す。reject を残すと
      // 以後のフォルダ移動が全部ここで詰まる
      .catch(() => {})
      .then(() =>
        dataApi.moveNote(note.storage, note.key, newStorageKey, newFolderKey)
      )
      .then(newNote => {
        // ディスク直読みの newNote は正規化を通っていない。タブ数が
        // 減っている場合に備えて snippetIndex も収める
        const snippets = normalizeSnippets(newNote.snippets)
        this.setState(
          {
            isMovingNote: true,
            note: Object.assign({}, newNote, { snippets }),
            snippetIndex: Math.min(this.state.snippetIndex, snippets.length - 1)
          },
          () => {
            const { dispatch, location } = this.props
            dispatch({
              type: 'MOVE_NOTE',
              originNote: note,
              // redux 側にも修復済みの形で入れる(moveNote はディスクを
              // 生で読むので、壊れた snippets がそのまま store へ戻り得る)。
              // state.note とは snippets を共有しない(このコンポーネントは
              // 要素を直接書き換えるため、別の正規化コピーを渡す)
              note: Object.assign({}, newNote, {
                snippets: normalizeSnippets(newNote.snippets)
              })
            })
            dispatch(
              replace({
                pathname: location.pathname,
                search: queryString.stringify({
                  key: newNote.key
                })
              })
            )
            this.setState({
              isMovingNote: false
            })
          }
        )
      })
  }

  handleFontSizeChange(zoom) {
    // App-wide text size = webFrame zoom factor (see MarkdownNoteDetail).
    ZoomManager.setZoom(zoom)
    this.props.dispatch({ type: 'SET_ZOOM', zoom })
  }

  handleStarButtonClick(e) {
    const { note } = this.state
    if (!note.isStarred)
      AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_STAR')

    note.isStarred = !note.isStarred

    this.setState(
      {
        note
      },
      () => {
        this.save()
      }
    )
  }

  exportAsFile() {}

  handleTrashButtonClick(e) {
    const { note } = this.state
    const { isTrashed } = note
    const { confirmDeletion } = this.props.config.ui

    if (isTrashed) {
      if (confirmDeleteNote(confirmDeletion, true)) {
        const { note, dispatch } = this.props
        dataApi
          .deleteNote(note.storage, note.key)
          .then(data => {
            const dispatchHandler = () => {
              dispatch({
                type: 'DELETE_NOTE',
                storageKey: data.storageKey,
                noteKey: data.noteKey
              })
            }
            ee.once('list:next', dispatchHandler)
          })
          .then(() => ee.emit('list:next'))
      }
    } else {
      if (confirmDeleteNote(confirmDeletion, false)) {
        note.isTrashed = true

        this.setState(
          {
            note
          },
          () => {
            this.save()
          }
        )

        ee.emit('list:next')
      }
    }
  }

  handleUndoButtonClick(e) {
    const { note } = this.state

    note.isTrashed = false

    this.setState(
      {
        note
      },
      () => {
        this.save()
        ee.emit('list:next')
      }
    )
  }

  handleTabMoveLeftButtonClick(e) {
    {
      const left = this.visibleTabs.scrollLeft

      const tabs = this.allTabs.querySelectorAll('div')
      const lastVisibleTab = Array.from(tabs).find(tab => {
        return tab.offsetLeft + tab.offsetWidth >= left
      })

      if (lastVisibleTab) {
        const visiblePart =
          lastVisibleTab.offsetWidth + lastVisibleTab.offsetLeft - left
        const isFullyVisible =
          visiblePart >
          lastVisibleTab.offsetWidth * this.scrollToNextTabThreshold
        const scrollToTab =
          isFullyVisible && lastVisibleTab.previousSibling
            ? lastVisibleTab.previousSibling
            : lastVisibleTab

        // FIXME use `scrollIntoView()` instead of custom method after update to Electron2.0 (with Chrome 61 its possible animate the scroll)
        this.moveToTab(scrollToTab)
        // scrollToTab.scrollIntoView({behavior: 'smooth', inline: 'start', block: 'start'})
      }
    }
  }

  handleTabMoveRightButtonClick(e) {
    const left = this.visibleTabs.scrollLeft
    const width = this.visibleTabs.offsetWidth

    const tabs = this.allTabs.querySelectorAll('div')
    const lastVisibleTab = Array.from(tabs).find(tab => {
      return tab.offsetLeft + tab.offsetWidth >= width + left
    })

    if (lastVisibleTab) {
      const visiblePart = width + left - lastVisibleTab.offsetLeft
      const isFullyVisible =
        visiblePart > lastVisibleTab.offsetWidth * this.scrollToNextTabThreshold
      const scrollToTab =
        isFullyVisible && lastVisibleTab.nextSibling
          ? lastVisibleTab.nextSibling
          : lastVisibleTab

      // FIXME use `scrollIntoView()` instead of custom method after update to Electron2.0 (with Chrome 61 its possible animate the scroll)
      this.moveToTab(scrollToTab)
      // scrollToTab.scrollIntoView({behavior: 'smooth', inline: 'end', block: 'end'})
    }
  }

  handleTabPlusButtonClick(e) {
    this.addSnippet()
  }

  handleTabButtonClick(e, index) {
    this.setState({
      snippetIndex: index
    })
  }

  handleTabDragStart(e, index) {
    e.dataTransfer.setData('text/plain', index)
  }

  handleTabDrop(e, index) {
    const oldIndex = parseInt(e.dataTransfer.getData('text'))

    // タブ以外からのドロップ(OS のファイルやノート一覧の行)は getData が
    // 空で NaN になり、undefined をタブ配列へ書き込んでしまう
    if (
      !Number.isInteger(oldIndex) ||
      oldIndex < 0 ||
      oldIndex >= this.state.note.snippets.length
    ) {
      return
    }

    const snippets = this.state.note.snippets.slice()
    const draggedSnippet = snippets[oldIndex]
    snippets[oldIndex] = snippets[index]
    snippets[index] = draggedSnippet
    const snippetIndex = index

    const note = Object.assign({}, this.state.note, { snippets })
    this.setState({ note, snippetIndex }, () => {
      this.save()
      this.refs['code-' + index].reload()
      this.refs['code-' + oldIndex].reload()
    })
  }

  handleTabDeleteButtonClick(e, index) {
    if (this.state.note.snippets.length > 1) {
      if (this.state.note.snippets[index].content.trim().length > 0) {
        const dialogIndex = dialog.showMessageBoxSync(
          remote.getCurrentWindow(),
          {
            type: 'warning',
            message: i18n.__('Delete a snippet'),
            detail: i18n.__('This work cannot be undone.'),
            buttons: [i18n.__('Confirm'), i18n.__('Cancel')]
          }
        )
        if (dialogIndex === 0) {
          this.deleteSnippetByIndex(index)
        }
      } else {
        this.deleteSnippetByIndex(index)
      }
    }
  }

  deleteSnippetByIndex(index) {
    const snippets = this.state.note.snippets.slice()
    snippets.splice(index, 1)
    const note = Object.assign({}, this.state.note, { snippets })
    const snippetIndex =
      this.state.snippetIndex >= snippets.length
        ? snippets.length - 1
        : this.state.snippetIndex
    this.setState({ note, snippetIndex }, () => {
      this.save()
      this.refs['code-' + this.state.snippetIndex].reload()

      if (this.visibleTabs.offsetWidth > this.allTabs.scrollWidth) {
        this.moveTabBarBy(0)
      } else {
        const lastTab = this.allTabs.lastChild
        if (
          lastTab.offsetLeft + lastTab.offsetWidth <
          this.visibleTabs.offsetWidth
        ) {
          const width = this.visibleTabs.offsetWidth
          const newLeft = lastTab.offsetLeft + lastTab.offsetWidth - width
          this.moveTabBarBy(newLeft > 0 ? -newLeft : 0)
        } else {
          this.setState(this.getArrowsState())
        }
      }
    })
  }

  renameSnippetByIndex(index, name) {
    const snippets = this.state.note.snippets.slice()
    snippets[index].name = name
    const syntax = CodeMirror.findModeByFileName(name.trim())
    const mode = syntax != null ? syntax.name : null
    if (mode != null) {
      snippets[index].mode = mode
      AwsMobileAnalyticsConfig.recordDynamicCustomEvent('SNIPPET_LANG', {
        name: mode
      })
    }
    this.setState(state => ({
      note: Object.assign(state.note, { snippets: snippets })
    }))

    this.setState(
      state => ({
        note: state.note
      }),
      () => {
        this.save()
      }
    )
  }

  handleModeOptionClick(index, name) {
    return e => {
      const snippets = this.state.note.snippets.slice()
      snippets[index].mode = name
      this.setState(state => ({
        note: Object.assign(state.note, { snippets: snippets })
      }))

      this.setState(
        state => ({
          note: state.note
        }),
        () => {
          this.save()
        }
      )

      AwsMobileAnalyticsConfig.recordDynamicCustomEvent('SELECT_LANG', {
        name
      })
    }
  }

  handleCodeChange(index) {
    return e => {
      const snippets = this.state.note.snippets.slice()
      snippets[index].content = this.refs['code-' + index].value
      snippets[index].linesHighlighted = e.options.linesHighlighted

      this.setState(state => ({
        note: Object.assign(state.note, { snippets: snippets })
      }))
      this.setState(
        state => ({
          note: state.note
        }),
        () => {
          this.save()
        }
      )
    }
  }

  handleKeyDown(e) {
    // 修飾キー + 1..9 で左から N 番目のタブへ移動する。
    // 下の switch より前に置く（Cmd+1 は switch のどのケースにも当たらない）
    const jumpTo = getJumpNumber(e)
    if (jumpTo !== null) {
      e.preventDefault()
      this.jumpToTab(jumpTo - 1)
      return
    }

    // 修飾キー + Shift + [ / ] で左右のタブへ。
    // Shift を押している間 e.key は '{' '}' 等になるので判定に使えない。
    // 物理キー位置を指す e.code で見て、古い環境向けに keyCode も残す
    const bracket = getBracketDirection(e)
    if (bracket !== 0) {
      e.preventDefault()
      if (bracket < 0) this.jumpPrevTab()
      else this.jumpNextTab()
      return
    }

    switch (e.keyCode) {
      // tab key
      case 9:
        if (e.ctrlKey && !e.shiftKey) {
          e.preventDefault()
          this.jumpNextTab()
        } else if (e.ctrlKey && e.shiftKey) {
          e.preventDefault()
          this.jumpPrevTab()
        } else if (
          !e.ctrlKey &&
          !e.shiftKey &&
          e.target === this.refs.description
        ) {
          e.preventDefault()
          this.focusEditor()
        }
        break
      // I key
      case 73:
        {
          const isSuper =
            global.process.platform === 'darwin' ? e.metaKey : e.ctrlKey
          if (isSuper) {
            e.preventDefault()
            this.handleInfoButtonClick(e)
          }
        }
        break
      // L key
      case 76:
        {
          const isSuper =
            global.process.platform === 'darwin' ? e.metaKey : e.ctrlKey
          if (isSuper) {
            e.preventDefault()
            this.focus()
          }
        }
        break
      // T key
      case 84:
        {
          const isSuper =
            global.process.platform === 'darwin' ? e.metaKey : e.ctrlKey
          if (isSuper && !e.shiftKey && !e.altKey) {
            e.preventDefault()
            this.addSnippet()
          }
        }
        break
    }
  }

  handleModeButtonClick(e, index) {
    const templetes = []
    CodeMirror.modeInfo
      .sort(function(a, b) {
        return a.name.localeCompare(b.name)
      })
      .forEach(mode => {
        templetes.push({
          label: mode.name,
          click: e => this.handleModeOptionClick(index, mode.name)(e)
        })
      })
    context.popup(templetes)
  }

  handleIndentTypeButtonClick(e) {
    context.popup([
      {
        label: 'tab',
        click: e => this.handleIndentTypeItemClick(e, 'tab')
      },
      {
        label: 'space',
        click: e => this.handleIndentTypeItemClick(e, 'space')
      }
    ])
  }

  handleIndentSizeButtonClick(e) {
    context.popup([
      {
        label: '2',
        click: e => this.handleIndentSizeItemClick(e, 2)
      },
      {
        label: '4',
        click: e => this.handleIndentSizeItemClick(e, 4)
      },
      {
        label: '8',
        click: e => this.handleIndentSizeItemClick(e, 8)
      }
    ])
  }

  handleWrapLineButtonClick(e) {
    context.popup([
      {
        label: 'on',
        click: e => this.handleWrapLineItemClick(e, true)
      },
      {
        label: 'off',
        click: e => this.handleWrapLineItemClick(e, false)
      }
    ])
  }

  handleIndentSizeItemClick(e, indentSize) {
    const { config, dispatch } = this.props
    const editor = Object.assign({}, config.editor, {
      indentSize
    })
    ConfigManager.set({
      editor
    })
    dispatch({
      type: 'SET_CONFIG',
      config: {
        editor
      }
    })
  }

  handleIndentTypeItemClick(e, indentType) {
    const { config, dispatch } = this.props
    const editor = Object.assign({}, config.editor, {
      indentType
    })
    ConfigManager.set({
      editor
    })
    dispatch({
      type: 'SET_CONFIG',
      config: {
        editor
      }
    })
  }

  handleWrapLineItemClick(e, lineWrapping) {
    const { config, dispatch } = this.props
    const editor = Object.assign({}, config.editor, {
      lineWrapping
    })
    ConfigManager.set({
      editor
    })
    dispatch({
      type: 'SET_CONFIG',
      config: {
        editor
      }
    })
  }

  focus() {
    this.refs.description.focus()
  }

  /**
   * description を展開中か。トグルで固定した時とフォーカス中だけ広げ、
   * それ以外は 1 行に畳んで本文（タブとエディタ）を上に詰める
   */
  isDescriptionExpanded(state) {
    const target = state || this.state
    return target.isDescriptionPinned || target.isDescriptionFocused
  }

  handleDescriptionToggleClick() {
    const next = !this.isDescriptionExpanded()
    // 畳む時はフォーカスも外す。残すと isDescriptionFocused で
    // すぐ開き直り、ボタンが効かないように見える
    if (!next && document.activeElement === this.refs.description) {
      this.refs.description.blur()
    }
    this.setState({
      isDescriptionPinned: next,
      isDescriptionFocused: next ? this.state.isDescriptionFocused : false
    })
  }

  handleDescriptionFocus() {
    this.setState({ isDescriptionFocused: true })
  }

  handleDescriptionBlur() {
    this.setState({ isDescriptionFocused: false })
  }

  moveToTab(tab) {
    const easeOutCubic = t => --t * t * t + 1
    const startScrollPosition = this.visibleTabs.scrollLeft
    const animationTiming = 300
    const scrollMoreCoeff = 1.4 // introduce coefficient, because we want to scroll a bit further to see next tab

    let scrollBy = tab.offsetLeft - startScrollPosition

    if (tab.offsetLeft > startScrollPosition) {
      // if tab is on the right side and we want to show the whole tab in visible area,
      // we need to include width of the tab and visible area in the formula
      //  ___________________________________________
      // |____|_______|________|________|_show_this_|
      //        ↑_____________________↑
      //            visible area
      scrollBy += tab.offsetWidth - this.visibleTabs.offsetWidth
    }

    let startTime = null
    const scrollAnimation = time => {
      startTime = startTime || time
      const elapsed = (time - startTime) / animationTiming

      this.visibleTabs.scrollLeft =
        startScrollPosition + easeOutCubic(elapsed) * scrollBy * scrollMoreCoeff
      if (elapsed < 1) {
        window.requestAnimationFrame(scrollAnimation)
      } else {
        this.setState(this.getArrowsState())
      }
    }

    window.requestAnimationFrame(scrollAnimation)
  }

  getArrowsState() {
    const allTabs = this.allTabs
    const visibleTabs = this.visibleTabs

    const showArrows = visibleTabs.offsetWidth < allTabs.scrollWidth
    const enableRightArrow =
      visibleTabs.scrollLeft !== allTabs.scrollWidth - visibleTabs.offsetWidth
    const enableLeftArrow = visibleTabs.scrollLeft !== 0

    return { showArrows, enableRightArrow, enableLeftArrow }
  }

  addSnippet() {
    const {
      config: {
        editor: { snippetDefaultLanguage }
      }
    } = this.props
    const { note } = this.state

    const defaultLanguage =
      snippetDefaultLanguage === 'Auto Detect' ? null : snippetDefaultLanguage

    note.snippets = note.snippets.concat([
      {
        name: '',
        mode: defaultLanguage,
        content: '',
        linesHighlighted: []
      }
    ])
    const snippetIndex = note.snippets.length - 1

    this.setState(
      Object.assign(
        {
          note,
          snippetIndex
        },
        this.getArrowsState()
      ),
      () => {
        if (this.state.showArrows) {
          const tabs = this.allTabs.querySelectorAll('div')
          if (tabs) {
            this.moveToTab(tabs[snippetIndex])
          }
        }
        this.refs['tab-' + snippetIndex].startRenaming()
      }
    )
  }

  /**
   * タブ削除やフォルダ移動の競合で snippetIndex が範囲外になっても
   * 落とさないよう、実際に描画されている index に丸めて返す
   */
  getActiveSnippetIndex() {
    return Math.min(
      this.state.snippetIndex,
      this.state.note.snippets.length - 1
    )
  }

  /** 表示順で index 番目のタブを選び、画面外なら見える位置までスクロールする */
  selectTab(index) {
    if (index < 0 || index >= this.state.note.snippets.length) return
    this.setState({ snippetIndex: index, showJumpHints: false }, () => {
      this.scrollTabIntoView(index)
      this.focusEditor()
    })
  }

  scrollTabIntoView(index) {
    if (!this.state.showArrows || !this.allTabs) return
    const tabs = this.allTabs.querySelectorAll('div')
    if (tabs[index]) this.moveToTab(tabs[index])
  }

  /** 修飾キー + 1..9 の移動先。バッジを出していない 10 枚目以降へは飛ばさない */
  jumpToTab(index) {
    if (index >= MAX_JUMP_TARGETS) return
    this.selectTab(index)
  }

  jumpNextTab() {
    const { length } = this.state.note.snippets
    this.selectTab((this.getActiveSnippetIndex() + 1) % length)
  }

  jumpPrevTab() {
    const { length } = this.state.note.snippets
    this.selectTab((this.getActiveSnippetIndex() - 1 + length) % length)
  }

  focusEditor() {
    const editor = this.refs['code-' + this.getActiveSnippetIndex()]
    if (editor) editor.focus()
  }

  handleInfoButtonClick(e) {
    // DOM の style を直接書き換えると、次の再描画で JSX の style が
    // 再適用されて勝手に閉じる（「一瞬出てすぐ消える」の原因）
    this.setState(prev => ({ isInfoPanelOpen: !prev.isInfoPanelOpen }))
  }

  showWarning(e, msg) {
    const warningMessage = msg =>
      ({
        'export-txt': 'Text export',
        'export-md': 'Markdown export',
        'export-html': 'HTML export',
        'export-pdf': 'PDF export',
        'preview-pdf': 'PDF preview',
        print: 'Print'
      }[msg])

    dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      message: i18n.__('Sorry!'),
      detail: i18n.__(
        warningMessage(msg) + ' is available only in markdown notes.'
      ),
      buttons: [i18n.__('OK')]
    })
  }

  render() {
    const { data, dispatch, config, location } = this.props
    const { note } = this.state

    // タブ削除やフォルダ移動の競合で index が範囲外になっても落とさない
    // (normalizeSnippets が最低1個を保証するので length - 1 >= 0)
    const activeSnippetIndex = this.getActiveSnippetIndex()

    const isDescriptionExpanded = this.isDescriptionExpanded()
    // 畳んだ時の高さは description の実フォントサイズから出す。
    // 固定値だとプレビューのフォントを大きくした環境で 1 行目が欠ける
    const descriptionFontSize = parseInt(config.preview.fontSize, 10) || 14
    const collapsedDescriptionHeight =
      Math.ceil(descriptionFontSize * DESCRIPTION_LINE_HEIGHT) +
      DESCRIPTION_CHROME_HEIGHT
    const descriptionHeight = isDescriptionExpanded
      ? Math.max(DESCRIPTION_EXPANDED_HEIGHT, collapsedDescriptionHeight)
      : collapsedDescriptionHeight
    const tabsTop =
      descriptionHeight +
      (isDescriptionExpanded ? DESCRIPTION_GAP : DESCRIPTION_GAP_COLLAPSED)

    const storageKey = note.storage
    const folderKey = note.folder

    const autoDetect = config.editor.snippetDefaultLanguage === 'Auto Detect'

    let editorFontSize = parseInt(config.editor.fontSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 101)) editorFontSize = 14
    let editorIndentSize = parseInt(config.editor.indentSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 132)) editorIndentSize = 4

    const tabList = note.snippets.map((snippet, index) => {
      const isActive = this.state.snippetIndex === index

      return (
        <SnippetTab
          key={index}
          ref={'tab-' + index}
          snippet={snippet}
          isActive={isActive}
          onClick={e => this.handleTabButtonClick(e, index)}
          onDelete={e => this.handleTabDeleteButtonClick(e, index)}
          onRename={name => this.renameSnippetByIndex(index, name)}
          isDeletable={note.snippets.length > 1}
          onDragStart={e => this.handleTabDragStart(e, index)}
          onDrop={e => this.handleTabDrop(e, index)}
          jumpHint={
            this.state.showJumpHints && index < MAX_JUMP_TARGETS
              ? index + 1
              : null
          }
        />
      )
    })

    const viewList = note.snippets.map((snippet, index) => {
      const isActive = this.state.snippetIndex === index
      return (
        <div
          styleName='tabView'
          key={index}
          style={{ zIndex: isActive ? 5 : 4 }}
        >
          {snippet.mode === 'Markdown' ||
          snippet.mode === 'GitHub Flavored Markdown' ? (
            <MarkdownEditor
              styleName='tabView-content'
              value={snippet.content}
              config={config}
              linesHighlighted={snippet.linesHighlighted}
              onChange={e => this.handleCodeChange(index)(e)}
              ref={'code-' + index}
              ignorePreviewPointerEvents={this.props.ignorePreviewPointerEvents}
              storageKey={storageKey}
            />
          ) : (
            <CodeEditor
              styleName='tabView-content'
              mode={
                snippet.mode ||
                (autoDetect ? null : config.editor.snippetDefaultLanguage)
              }
              value={snippet.content}
              linesHighlighted={snippet.linesHighlighted}
              lineWrapping={config.editor.lineWrapping}
              theme={config.editor.theme}
              fontFamily={config.editor.fontFamily}
              fontSize={editorFontSize}
              indentType={config.editor.indentType}
              indentSize={editorIndentSize}
              displayLineNumbers={config.editor.displayLineNumbers}
              matchingPairs={config.editor.matchingPairs}
              matchingCloseBefore={config.editor.matchingCloseBefore}
              matchingTriples={config.editor.matchingTriples}
              explodingPairs={config.editor.explodingPairs}
              codeBlockMatchingPairs={config.editor.codeBlockMatchingPairs}
              codeBlockMatchingCloseBefore={
                config.editor.codeBlockMatchingCloseBefore
              }
              codeBlockMatchingTriples={config.editor.codeBlockMatchingTriples}
              codeBlockExplodingPairs={config.editor.codeBlockExplodingPairs}
              keyMap={config.editor.keyMap}
              scrollPastEnd={config.editor.scrollPastEnd}
              fetchUrlTitle={config.editor.fetchUrlTitle}
              enableTableEditor={config.editor.enableTableEditor}
              onChange={e => this.handleCodeChange(index)(e)}
              ref={'code-' + index}
              enableSmartPaste={config.editor.enableSmartPaste}
              hotkey={config.hotkey}
              autoDetect={autoDetect}
              dateFormatISO8601={config.editor.dateFormatISO8601}
              storageKey={storageKey}
              noteKey={note.key}
            />
          )}
        </div>
      )
    })

    const options = []
    data.storageMap.forEach((storage, index) => {
      storage.folders.forEach(folder => {
        options.push({
          storage: storage,
          folder: folder
        })
      })
    })

    const currentOption = _.find(
      options,
      option =>
        option.storage.key === storageKey && option.folder.key === folderKey
    )

    // currentOption may be undefined
    const storageName = _.get(currentOption, 'storage.name') || ''
    const folderName = _.get(currentOption, 'folder.name') || ''

    const trashTopBar = (
      <div styleName='info'>
        <div styleName='info-left'>
          <RestoreButton onClick={e => this.handleUndoButtonClick(e)} />
        </div>
        <div styleName='info-right'>
          <PermanentDeleteButton
            onClick={e => this.handleTrashButtonClick(e)}
          />
          <InfoButton onClick={e => this.handleInfoButtonClick(e)} />
          <InfoPanelTrashed
            storageName={storageName}
            folderName={folderName}
            updatedAt={formatDate(note.updatedAt)}
            createdAt={formatDate(note.createdAt)}
            exportAsMd={this.showWarning}
            exportAsTxt={this.showWarning}
            exportAsHtml={this.showWarning}
            exportAsPdf={this.showWarning}
          />
        </div>
      </div>
    )

    const detailTopBar = (
      <div styleName='info'>
        <div styleName='info-left'>
          <div>
            <FolderSelect
              styleName='info-left-top-folderSelect'
              value={this.state.note.storage + '-' + this.state.note.folder}
              ref='folder'
              data={data}
              onChange={e => this.handleFolderChange(e)}
            />
          </div>

          <TagSelect
            ref='tags'
            value={this.state.note.tags}
            saveTagsAlphabetically={config.ui.saveTagsAlphabetically}
            showTagsAlphabetically={config.ui.showTagsAlphabetically}
            data={data}
            dispatch={dispatch}
            onChange={e => this.handleChange(e)}
            coloredTags={config.coloredTags}
          />
        </div>
        <div styleName='info-right'>
          <FontSizeControl
            zoom={config.zoom}
            onChange={zoom => this.handleFontSizeChange(zoom)}
          />
          <StarButton
            onClick={e => this.handleStarButtonClick(e)}
            isActive={note.isStarred}
          />

          <TrashButton onClick={e => this.handleTrashButtonClick(e)} />

          <InfoButton onClick={e => this.handleInfoButtonClick(e)} />

          <InfoPanel
            isOpen={this.state.isInfoPanelOpen}
            ref={c => {
              this.infoPanelRef = c
            }}
            storageName={storageName}
            folderName={folderName}
            noteLink={`[${note.title}](:note:${
              queryString.parse(location.search).key
            })`}
            updatedAt={formatDate(note.updatedAt)}
            createdAt={formatDate(note.createdAt)}
            exportAsMd={this.showWarning}
            exportAsTxt={this.showWarning}
            exportAsHtml={this.showWarning}
            exportAsPdf={this.showWarning}
            previewAsPdf={this.showWarning}
            type={note.type}
            print={this.showWarning}
          />
        </div>
      </div>
    )

    return (
      <div
        className='NoteDetail'
        style={this.props.style}
        styleName='root'
        onKeyDown={e => this.handleKeyDown(e)}
        ref={c => {
          this.detailRoot = c
        }}
      >
        {location.pathname === '/trashed' ? trashTopBar : detailTopBar}

        <div
          styleName='body'
          style={{
            '--tb-description-height': descriptionHeight + 'px',
            '--tb-tabs-top': tabsTop + 'px'
          }}
        >
          <div styleName='description'>
            <textarea
              style={{
                fontFamily: config.preview.fontFamily,
                fontSize: parseInt(config.preview.fontSize, 10),
                lineHeight: DESCRIPTION_LINE_HEIGHT,
                // 畳んでいる間は 1 行だけ見せる。auto のままだと
                // 2 行目以降を持つノートでスクロールバーが出る
                overflowY: isDescriptionExpanded ? 'auto' : 'hidden'
              }}
              ref='description'
              placeholder={i18n.__('Description...')}
              value={this.state.note.description}
              onChange={e => this.handleChange(e)}
              onFocus={e => this.handleDescriptionFocus(e)}
              onBlur={e => this.handleDescriptionBlur(e)}
            />
            <button
              styleName='description-toggle'
              title={i18n.__(
                isDescriptionExpanded
                  ? 'Collapse description'
                  : 'Expand description'
              )}
              onClick={e => this.handleDescriptionToggleClick(e)}
            >
              <i
                className={
                  isDescriptionExpanded
                    ? 'fa fa-chevron-up'
                    : 'fa fa-chevron-down'
                }
              />
            </button>
          </div>
          <div styleName='tabList'>
            <button
              styleName='tabButton'
              hidden={!this.state.showArrows}
              disabled={!this.state.enableLeftArrow}
              onClick={e => this.handleTabMoveLeftButtonClick(e)}
            >
              <i className='fa fa-chevron-left' />
            </button>
            <div
              styleName='list'
              onScroll={e => {
                this.setState(this.getArrowsState())
              }}
              ref={tabs => {
                this.visibleTabs = tabs
              }}
            >
              <div
                styleName='allTabs'
                ref={tabs => {
                  this.allTabs = tabs
                }}
              >
                {tabList}
              </div>
            </div>
            <button
              styleName='tabButton'
              hidden={!this.state.showArrows}
              disabled={!this.state.enableRightArrow}
              onClick={e => this.handleTabMoveRightButtonClick(e)}
            >
              <i className='fa fa-chevron-right' />
            </button>
            <button
              styleName='tabButton'
              onClick={e => this.handleTabPlusButtonClick(e)}
            >
              <i className='fa fa-plus' />
            </button>
          </div>
          {viewList}
        </div>

        <div styleName='override'>
          <button
            onClick={e => this.handleModeButtonClick(e, activeSnippetIndex)}
          >
            {note.snippets[activeSnippetIndex].mode == null
              ? i18n.__('Select Syntax...')
              : note.snippets[activeSnippetIndex].mode}
            &nbsp;
            <i className='fa fa-caret-down' />
          </button>
          <button onClick={e => this.handleIndentTypeButtonClick(e)}>
            Indent: {config.editor.indentType}&nbsp;
            <i className='fa fa-caret-down' />
          </button>
          <button onClick={e => this.handleIndentSizeButtonClick(e)}>
            size: {config.editor.indentSize}&nbsp;
            <i className='fa fa-caret-down' />
          </button>
          <button onClick={e => this.handleWrapLineButtonClick(e)}>
            Wrap Line: {config.editor.lineWrapping ? 'on' : 'off'}&nbsp;
            <i className='fa fa-caret-down' />
          </button>
        </div>

        <StatusBar
          {..._.pick(this.props, ['config', 'location', 'dispatch'])}
          date={note.updatedAt}
        />
      </div>
    )
  }
}

SnippetNoteDetail.propTypes = {
  dispatch: PropTypes.func,
  repositories: PropTypes.array,
  note: PropTypes.shape({}),
  style: PropTypes.shape({
    left: PropTypes.number
  }),
  ignorePreviewPointerEvents: PropTypes.bool
}

export default CSSModules(SnippetNoteDetail, styles)
