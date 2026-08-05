/* eslint-disable camelcase */
import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './MarkdownNoteDetail.styl'
import MarkdownEditor from 'browser/components/MarkdownEditor'
import MarkdownSplitEditor from 'browser/components/MarkdownSplitEditor'
import TodoListPercentage from 'browser/components/TodoListPercentage'
import StarButton from './StarButton'
import TagSelect from './TagSelect'
import FolderSelect from './FolderSelect'
import dataApi from 'browser/main/lib/dataApi'
import ee from 'browser/main/lib/eventEmitter'
import markdown from 'browser/lib/markdownTextHelper'
import StatusBar from '../StatusBar'
import _ from 'lodash'
import { findNoteTitle } from 'browser/lib/findNoteTitle'
import AwsMobileAnalyticsConfig from 'browser/main/lib/AwsMobileAnalyticsConfig'
import ConfigManager from 'browser/main/lib/ConfigManager'
import TrashButton from './TrashButton'
import RestoreButton from './RestoreButton'
import PermanentDeleteButton from './PermanentDeleteButton'
import InfoButton from './InfoButton'
import ModeSwitcher from './ModeSwitcher'
import FontSizeControl from './FontSizeControl'
import ZoomManager from 'browser/main/lib/ZoomManager'
import InfoPanel from './InfoPanel'
import InfoPanelTrashed from './InfoPanelTrashed'
import { formatDate } from 'browser/lib/date-formatter'
import { getTodoPercentageOfCompleted } from 'browser/lib/getTodoStatus'
import striptags from 'striptags'
import { confirmDeleteNote } from 'browser/lib/confirmDeleteNote'
import markdownToc from 'browser/lib/markdown-toc-generator'
import queryString from 'query-string'
import { replace } from 'connected-react-router'
import ToggleDirectionButton from 'browser/main/Detail/ToggleDirectionButton'
import TocPane from 'browser/main/Detail/TocPane'
import i18n from 'browser/lib/i18n'

// Preview-only は「今の見え方」であってノート単位の属性ではないので、
// コンポーネント state だけに置いてはいけない。Detail/index.js はノート種別で
// 別コンポーネント（SnippetNoteDetail）を描くため、スニペットノートを1件挟むと
// MarkdownNoteDetail が unmount され、戻った時に false で作り直される。
// 上下キーでノートを送っていると、スニペットを通過した瞬間に全面 Preview が
// 勝手 に Split へ落ちていた。config には持たない（新規ノートの開き方は
// 変えたくない）ので、セッション内だけ保持する。
// 目次ペインの幅。狭すぎると見出しが読めず、広すぎると本文が潰れる
const DEFAULT_TOC_WIDTH = 200
const MIN_TOC_WIDTH = 140
const MAX_TOC_WIDTH = 480

let sessionPreviewOnly = false

// テスト用。実アプリからは呼ばない
export function __resetSessionPreviewOnly() {
  sessionPreviewOnly = false
}

class MarkdownNoteDetail extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      // 情報パネルの表示。DOM 直書きだと再描画で閉じてしまう
      isInfoPanelOpen: false,
      isMovingNote: false,
      note: Object.assign(
        {
          title: '',
          content: '',
          linesHighlighted: []
        },
        props.note
      ),
      // Lock button retired: the 3-way ModeSwitcher (Editor/Split/Preview)
      // makes the editor/preview lock redundant.
      isLockButtonShown: false,
      isLocked: false,
      editorType: props.config.editor.type,
      switchPreview: props.config.editor.switchPreview,
      // Transient preview-only view (editor hidden). Not persisted to config, so
      // it never changes how new notes open — it's a per-session view toggle.
      // 直前の見え方を引き継ぐ（unmount を挟んでも Preview のまま）
      previewOnly: sessionPreviewOnly,
      // ドラッグ中だけ使う一時値。離した時に config へ書く
      tocWidth: null,
      RTL: false
    }

    this.dispatchTimer = null

    this.generateToc = this.handleGenerateToc.bind(this)
    this.toggleLockButton = this.handleToggleLockButton.bind(this)
    this.handleUpdateContent = this.handleUpdateContent.bind(this)
    this.handleSwitchStackDirection = this.handleSwitchStackDirection.bind(this)
    this.getNote = this.getNote.bind(this)
    // Stable listener refs so componentWillUnmount can remove every listener.
    // Previously these were registered as inline/anonymous handlers that could
    // never be removed, leaking a listener on every note switch (and making the
    // toggle handlers fire multiple times).
    this.handleSwitchDirection = this.handleSwitchDirection.bind(this)
    this.handleDeleteNote = this.handleDeleteNote.bind(this)
    // The 3-way view switcher (ModeSwitcher) drives everything below.
    // viewMode is derived from (editorType, previewOnly) so no new persisted
    // state is needed: SPLIT/EDITOR persist via editor.type, PREVIEW is the
    // transient previewOnly override.
    // previewOnly の変更は必ずここを通す。state と一緒にセッション値も更新して
    // おかないと、unmount 後に戻した時に古い値へ巻き戻る
    this.setPreviewOnly = (value, callback) => {
      sessionPreviewOnly = value
      this.setState({ previewOnly: value }, callback)
    }
    this.handleSetViewMode = mode => {
      if (mode === 'PREVIEW') {
        this.setPreviewOnly(true)
      } else if (mode === 'SPLIT') {
        this.setPreviewOnly(false, () => this.handleSwitchMode('SPLIT'))
      } else {
        this.setPreviewOnly(false, () => {
          this.handleSwitchMode('EDITOR_PREVIEW')
          this.focus()
        })
      }
    }
    // Cmd/Ctrl+Alt+M cycles Editor → Split → Preview → Editor.
    this.handleToggleMode = () => {
      const order = ['EDITOR', 'SPLIT', 'PREVIEW']
      const next = order[(order.indexOf(this.getViewMode()) + 1) % order.length]
      this.handleSetViewMode(next)
    }
    // hotkey.togglePreview(既定 Cmd/Ctrl+E): Editor+Preview(SPLIT) ↔
    // 全面 Preview のトグル。全面 Editor は使用頻度が低いので、Preview
    // 解除時は元のモードに関係なく常に SPLIT へ戻す(全面 Editor へは
    // Cmd+Shift+E のサイクルか ModeSwitcher で行ける)
    this.handleTogglePreview = () => {
      if (this.state.previewOnly) {
        this.handleSetViewMode('SPLIT')
      } else {
        this.handleSetViewMode('PREVIEW')
      }
    }
  }

  /**
   * 目次の幅をドラッグで変える。mousemove / mouseup は window で受ける
   * （ポインタがペインの外へ出ても追従させるため）。確定時にだけ config へ
   * 書くので、ドラッグ中に保存が走り続けることはない
   */
  handleTocSliderMouseDown(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth =
      (this.props.config.preview || {}).tocWidth || DEFAULT_TOC_WIDTH

    const onMove = ev => {
      // 右へ動かすほど目次は狭くなる（境界は目次の左端）
      const next = Math.min(
        MAX_TOC_WIDTH,
        Math.max(MIN_TOC_WIDTH, startWidth - (ev.clientX - startX))
      )
      this.setState({ tocWidth: next })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const width = this.state.tocWidth
      this.setState({ tocWidth: null })
      if (width == null) return
      const { config, dispatch } = this.props
      const preview = Object.assign({}, config.preview, { tocWidth: width })
      ConfigManager.set({ preview })
      dispatch({ type: 'SET_UI', config: { preview } })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * 目次から見出しへ飛ぶ。slug ではなく行番号で引く（プレビューは data-line を
   * 持っている）。エディタとプレビューのどちらが出ていても効くよう、両方に
   * 当てる。参照が取れない構成では黙って何もしない
   */
  handleTocJump(line) {
    const content = this.refs.content
    if (!content) return
    const preview =
      (content.previewRef && content.previewRef.current) ||
      (content.refs && content.refs.preview)
    if (preview && typeof preview.scrollToLine === 'function') {
      preview.scrollToLine(line)
    }
    const code = content.refs && content.refs.code
    const cm = code && code.editor
    if (cm && typeof cm.setCursor === 'function') {
      cm.setCursor({ line, ch: 0 })
      cm.scrollIntoView({ line, ch: 0 }, 200)
    }
  }

  /**
   * 目次の表示切替。閉じると再表示の導線がペインごと消えるので、
   * ツールバーのボタンから戻せるようにしてある
   */
  handleToggleToc(next) {
    const { config, dispatch } = this.props
    const preview = Object.assign({}, config.preview, { showToc: !!next })
    ConfigManager.set({ preview })
    dispatch({ type: 'SET_UI', config: { preview } })
  }

  // Current view as one of the 3 switcher values.
  getViewMode() {
    if (this.state.previewOnly) return 'PREVIEW'
    return this.state.editorType === 'SPLIT' ? 'SPLIT' : 'EDITOR'
  }

  handleFontSizeChange(zoom) {
    // App-wide text size = webFrame zoom factor. ZoomManager persists it and
    // calls setZoomFactor(); SET_ZOOM keeps the StatusBar indicator in sync.
    ZoomManager.setZoom(zoom)
    this.props.dispatch({ type: 'SET_ZOOM', zoom })
  }

  focus() {
    this.refs.content.focus()
  }

  componentDidMount() {
    ee.on('editor:orientation', this.handleSwitchStackDirection)
    ee.on('topbar:togglelockbutton', this.toggleLockButton)
    ee.on('topbar:toggledirectionbutton', this.handleSwitchDirection)
    ee.on('topbar:togglemodebutton', this.handleToggleMode)
    ee.on('topbar:togglepreviewbutton', this.handleTogglePreview)
    ee.on('hotkey:deletenote', this.handleDeleteNote)
    ee.on('code:generate-toc', this.generateToc)
    // ホットキー設定から呼ばれる（config.hotkey.toggleInfo / focusNoteLink）
    this.toggleInfoHandler = () => this.handleInfoButtonClick()
    this.focusNoteLinkHandler = () => this.focusNoteLink()
    ee.on('detail:toggleinfo', this.toggleInfoHandler)
    ee.on('detail:focusnotelink', this.focusNoteLinkHandler)
    // 目次の表示切替（config.hotkey.toggleToc / 既定 Cmd+Shift+O）
    this.toggleTocHandler = () =>
      this.handleToggleToc(
        !((this.props.config.preview || {}).showToc !== false)
      )
    ee.on('detail:toggletoc', this.toggleTocHandler)
  }

  /**
   * 情報パネルを開いてノートリンクへフォーカスし、そのままコピーする。
   * リンクは頻繁に使うので、パネルを開く→探す→選ぶ の手数を省く。
   */
  focusNoteLink() {
    // 効かない時の切り分け用（DevTools から window.__tbNoteLink を見る）
    window.__tbNoteLink = { called: true, at: Date.now() }
    this.setState({ isInfoPanelOpen: true })
    // パネルの表示反映を待ってから選択する（非表示のままでは select できない）
    setTimeout(() => {
      const input = document.querySelector('[data-note-link]')
      if (!input) return
      // コピーを先に済ませる。copy-to-clipboard は一時要素を作って
      // フォーカスを奪うため、後に呼ぶと選択が外れる
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

  UNSAFE_componentWillReceiveProps(nextProps) {
    const isNewNote = nextProps.note.key !== this.props.note.key
    const hasDeletedTags =
      nextProps.note.tags.length < this.props.note.tags.length
    if (!this.state.isMovingNote && (isNewNote || hasDeletedTags)) {
      if (this.saveQueue != null) this.saveNow()
      this.setState(
        {
          note: Object.assign({ linesHighlighted: [] }, nextProps.note)
        },
        () => {
          this.refs.content.reload()
          if (this.refs.tags) this.refs.tags.reset()
        }
      )
    }

    // Focus content if using blur or double click
    // --> Moved here from componentDidMount so a re-render during search won't set focus to the editor
    const { switchPreview } = nextProps.config.editor

    if (this.state.switchPreview !== switchPreview) {
      this.setState({
        switchPreview
      })
      if (switchPreview === 'BLUR' || switchPreview === 'DBL_CLICK') {
        console.log('setting focus', switchPreview)
        this.focus()
      }
    }
  }

  componentWillUnmount() {
    ee.off('editor:orientation', this.handleSwitchStackDirection)
    ee.off('topbar:togglelockbutton', this.toggleLockButton)
    ee.off('topbar:toggledirectionbutton', this.handleSwitchDirection)
    ee.off('topbar:togglemodebutton', this.handleToggleMode)
    ee.off('topbar:togglepreviewbutton', this.handleTogglePreview)
    ee.off('hotkey:deletenote', this.handleDeleteNote)
    ee.off('code:generate-toc', this.generateToc)
    ee.off('detail:toggleinfo', this.toggleInfoHandler)
    ee.off('detail:focusnotelink', this.focusNoteLinkHandler)
    ee.off('detail:toggletoc', this.toggleTocHandler)
    if (this.saveQueue != null) this.saveNow()
  }

  handleUpdateTag() {
    const { note } = this.state
    if (this.refs.tags) note.tags = this.refs.tags.value
    this.updateNote(note)
  }

  handleUpdateContent() {
    const { note } = this.state
    note.content = this.refs.content.value

    let title = findNoteTitle(
      note.content,
      this.props.config.editor.enableFrontMatterTitle,
      this.props.config.editor.frontMatterTitleField
    )
    title = striptags(title)
    title = markdown.strip(title)
    note.title = title

    this.updateNote(note)
  }

  updateNote(note) {
    note.updatedAt = new Date()
    this.setState({ note }, () => {
      this.save()
    })
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

    dataApi
      .updateNote(note.storage, note.key, this.state.note)
      .then(note => {
        dispatch({
          type: 'UPDATE_NOTE',
          note: note
        })
        AwsMobileAnalyticsConfig.recordDynamicCustomEvent('EDIT_NOTE')
      })
      .catch(err => {
        console.error('Cannot save note: ' + err)
      })
  }

  handleFolderChange(e) {
    const { note } = this.state
    const value = this.refs.folder.value
    const splitted = value.split('-')
    const newStorageKey = splitted.shift()
    const newFolderKey = splitted.shift()

    dataApi
      .moveNote(note.storage, note.key, newStorageKey, newFolderKey)
      .then(newNote => {
        this.setState(
          {
            isMovingNote: true,
            note: Object.assign({}, newNote)
          },
          () => {
            const { dispatch, location } = this.props
            dispatch({
              type: 'MOVE_NOTE',
              originNote: note,
              note: newNote
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

  exportAsMd() {
    ee.emit('export:save-md')
  }

  exportAsTxt() {
    ee.emit('export:save-text')
  }

  exportAsHtml() {
    ee.emit('export:save-html')
  }

  exportAsPdf() {
    ee.emit('export:save-pdf')
  }

  previewAsPdf() {
    ee.emit('export:preview-pdf')
  }

  handleKeyDown(e) {
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
    }
  }

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
        this.refs.content.reload()
        ee.emit('list:next')
      }
    )
  }

  handleLockButtonMouseDown(e) {
    e.preventDefault()
    ee.emit('editor:lock')
    this.setState({ isLocked: !this.state.isLocked })
    if (this.state.isLocked) this.focus()
  }

  getToggleLockButton() {
    return this.state.isLocked
      ? '../resources/icon/icon-lock.svg'
      : '../resources/icon/icon-unlock.svg'
  }

  handleDeleteKeyDown(e) {
    if (e.keyCode === 27) this.handleDeleteCancelButtonClick(e)
  }

  handleToggleLockButton(event, noteStatus) {
    // first argument event is not used
    if (noteStatus === 'CODE') {
      this.setState({ isLockButtonShown: true })
    } else {
      this.setState({ isLockButtonShown: false })
    }
  }

  handleGenerateToc() {
    const editor = this.refs.content.refs.code.editor
    markdownToc.generateInEditor(editor)
  }

  handleFocus(e) {
    this.focus()
  }

  handleInfoButtonClick(e) {
    // DOM の style を直接書き換えると、次の再描画で JSX の style が
    // 再適用されて勝手に閉じる（「一瞬出てすぐ消える」の原因）
    this.setState(prev => ({ isInfoPanelOpen: !prev.isInfoPanelOpen }))
  }

  print(e) {
    ee.emit('print')
  }

  handleSwitchMode(type) {
    this.setState({ editorType: type, isLockButtonShown: false }, () => {
      this.focus()
      const newConfig = Object.assign({}, this.props.config)
      newConfig.editor.type = type
      ConfigManager.set(newConfig)
    })
  }

  handleSwitchStackDirection() {
    this.setState(
      prevState => ({ isStacking: !prevState.isStacking }),
      () => {
        this.focus()
        const newConfig = Object.assign({}, this.props.config)
        newConfig.ui.isStacking = this.state.isStacking
        ConfigManager.set(newConfig)
      }
    )
  }

  handleSwitchDirection() {
    // ホットキーが届いたかの切り分け用
    window.__tbDirection = Date.now()
    if (!this.props.config.editor.rtlEnabled) {
      return
    }
    // If in split mode, hide the lock button
    const direction = this.state.RTL
    this.setState({ RTL: !direction })
  }

  handleDeleteNote() {
    this.handleTrashButtonClick()
  }

  handleClearTodo() {
    const { note } = this.state
    const splitted = note.content.split('\n')

    const clearTodoContent = splitted
      .map(line => {
        const trimmedLine = line.trim()
        if (trimmedLine.match(/\[x\]/i)) {
          return line.replace(/\[x\]/i, '[ ]')
        } else {
          return line
        }
      })
      .join('\n')

    note.content = clearTodoContent
    this.refs.content.setValue(note.content)

    this.updateNote(note)
  }

  getNote() {
    return this.state.note
  }

  renderEditor() {
    const { config, ignorePreviewPointerEvents } = this.props
    const { note, isStacking, previewOnly } = this.state

    // previewOnly overrides any mode: render the single-pane editor pinned to
    // the preview (editor hidden). Otherwise fall back to the persisted mode.
    if (previewOnly || this.state.editorType === 'EDITOR_PREVIEW') {
      return (
        <MarkdownEditor
          ref='content'
          styleName='body-noteEditor'
          config={config}
          value={note.content}
          storageKey={note.storage}
          noteKey={note.key}
          linesHighlighted={note.linesHighlighted}
          onChange={this.handleUpdateContent}
          ignorePreviewPointerEvents={ignorePreviewPointerEvents}
          getNote={this.getNote}
          RTL={config.editor.rtlEnabled && this.state.RTL}
          pinnedStatus={previewOnly ? 'PREVIEW' : 'CODE'}
        />
      )
    } else {
      return (
        <MarkdownSplitEditor
          ref='content'
          config={config}
          value={note.content}
          storageKey={note.storage}
          noteKey={note.key}
          isStacking={isStacking}
          linesHighlighted={note.linesHighlighted}
          onChange={this.handleUpdateContent}
          ignorePreviewPointerEvents={ignorePreviewPointerEvents}
          getNote={this.getNote}
          RTL={config.editor.rtlEnabled && this.state.RTL}
        />
      )
    }
  }

  render() {
    const { data, dispatch, location, config } = this.props
    const { note } = this.state
    // 目次は Markdown ノートだけ。設定で消せる
    const showToc = (config.preview || {}).showToc !== false
    // ドラッグ中は state を見る（config へ書くのは離した時）
    const tocWidth =
      this.state.tocWidth != null
        ? this.state.tocWidth
        : (config.preview || {}).tocWidth || DEFAULT_TOC_WIDTH
    const storageKey = note.storage
    const folderKey = note.folder

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
            exportAsHtml={this.exportAsHtml}
            exportAsMd={this.exportAsMd}
            exportAsTxt={this.exportAsTxt}
            exportAsPdf={this.exportAsPdf}
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
            onChange={this.handleUpdateTag.bind(this)}
            coloredTags={config.coloredTags}
          />
          <TodoListPercentage
            onClearCheckboxClick={e => this.handleClearTodo(e)}
            percentageOfTodo={getTodoPercentageOfCompleted(note.content)}
          />
        </div>
        <div styleName='info-right'>
          <FontSizeControl
            zoom={config.zoom}
            onChange={zoom => this.handleFontSizeChange(zoom)}
          />
          {/* 目次を閉じるとペインごと導線が消えるので、ここから戻せるようにする */}
          <button
            styleName={showToc ? 'toc-toggle--active' : 'toc-toggle'}
            onClick={() => this.handleToggleToc(!showToc)}
            title={i18n.__(showToc ? 'Hide Outline' : 'Show Outline')}
            aria-label={i18n.__(showToc ? 'Hide Outline' : 'Show Outline')}
            aria-pressed={showToc}
          >
            <i className='fa fa-list-ul' aria-hidden='true' />
          </button>
          <ModeSwitcher
            viewMode={this.getViewMode()}
            onChange={this.handleSetViewMode}
          />
          {this.props.config.editor.rtlEnabled && (
            <ToggleDirectionButton
              onClick={e => this.handleSwitchDirection(e)}
              isRTL={this.state.RTL}
            />
          )}
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
            exportAsMd={this.exportAsMd}
            exportAsTxt={this.exportAsTxt}
            exportAsHtml={this.exportAsHtml}
            exportAsPdf={this.exportAsPdf}
            previewAsPdf={this.previewAsPdf}
            wordCount={note.content.trim().split(/\s+/g).length}
            letterCount={note.content.replace(/\r?\n/g, '').length}
            type={note.type}
            print={this.print}
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
      >
        {location.pathname === '/trashed' ? trashTopBar : detailTopBar}

        <div styleName='body'>
          <div
            styleName={showToc ? 'body-editor--with-toc' : 'body-editor'}
            style={showToc ? { right: tocWidth } : undefined}
          >
            {this.renderEditor()}
          </div>
          {showToc && (
            <div styleName='body-toc' style={{ width: tocWidth }}>
              <div
                styleName='toc-slider'
                onMouseDown={e => this.handleTocSliderMouseDown(e)}
                draggable='false'
              >
                <div styleName='toc-slider-hitbox' />
              </div>
              <TocPane
                content={note.content}
                config={config}
                onJump={line => this.handleTocJump(line)}
                onClose={() => this.handleToggleToc(false)}
              />
            </div>
          )}
        </div>

        <StatusBar
          {..._.pick(this.props, ['config', 'location', 'dispatch'])}
          date={note.updatedAt}
        />
      </div>
    )
  }
}

MarkdownNoteDetail.propTypes = {
  dispatch: PropTypes.func,
  repositories: PropTypes.array,
  note: PropTypes.shape({}),
  style: PropTypes.shape({
    left: PropTypes.number
  }),
  ignorePreviewPointerEvents: PropTypes.bool
}

export default CSSModules(MarkdownNoteDetail, styles)
