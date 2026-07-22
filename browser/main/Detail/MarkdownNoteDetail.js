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

class MarkdownNoteDetail extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
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
      previewOnly: false,
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
    this.handleSetViewMode = mode => {
      if (mode === 'PREVIEW') {
        this.setState({ previewOnly: true })
      } else if (mode === 'SPLIT') {
        this.setState({ previewOnly: false }, () =>
          this.handleSwitchMode('SPLIT')
        )
      } else {
        this.setState({ previewOnly: false }, () => {
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
    // Cmd/Ctrl+Alt+P toggles Preview on/off.
    this.handleTogglePreview = () => {
      if (this.state.previewOnly) {
        this.handleSetViewMode(
          this.state.editorType === 'SPLIT' ? 'SPLIT' : 'EDITOR'
        )
      } else {
        this.handleSetViewMode('PREVIEW')
      }
    }
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
    const infoPanel = document.querySelector('.infoPanel')
    if (infoPanel.style)
      infoPanel.style.display =
        infoPanel.style.display === 'none' ? 'inline' : 'none'
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

        <div styleName='body'>{this.renderEditor()}</div>

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
