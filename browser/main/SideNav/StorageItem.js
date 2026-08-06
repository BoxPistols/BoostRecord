import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './StorageItem.styl'
import modal from 'browser/main/lib/modal'
import CreateFolderModal from 'browser/main/modals/CreateFolderModal'
import RenameFolderModal from 'browser/main/modals/RenameFolderModal'
import FolderColorPopover from 'browser/components/FolderColorPopover'
import dataApi from 'browser/main/lib/dataApi'
import { moveNotesToFolder } from 'browser/main/lib/moveNotes'
import StorageItemChild from 'browser/components/StorageItem'
import _ from 'lodash'
import { SortableElement } from 'react-sortable-hoc'
import {
  buildFolderTree,
  ancestorPaths,
  collectFolderKeys,
  readCollapsedPaths,
  writeCollapsedPaths
} from 'browser/lib/folderTree'
import i18n from 'browser/lib/i18n'
import context from 'browser/lib/context'
import { push } from 'connected-react-router'

const remote = require('@electron/remote')
const { dialog } = remote
const escapeStringRegexp = require('escape-string-regexp')
const path = require('path')

class StorageItem extends React.Component {
  constructor(props) {
    super(props)

    const { storage } = this.props

    this.state = {
      isOpen: !!storage.isOpen,
      draggedOver: null,
      // 右クリック位置に出す色ポップオーバー { folder, x, y } | null
      colorPopover: null,
      // 折りたたんだフォルダのパス集合。既定は「全部開いている」。
      // 閉じた方を覚える形にすると、新しく作った子が勝手に隠れない
      collapsedPaths: readCollapsedPaths(storage.key)
    }
  }

  toggleFolderExpand(path) {
    this.setState(prev => {
      const next = new Set(prev.collapsedPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      writeCollapsedPaths(this.props.storage.key, next)
      return { collapsedPaths: next }
    })
  }

  handleHeaderContextMenu(e) {
    context.popup([
      {
        label: i18n.__('Add Folder'),
        click: e => this.handleAddFolderButtonClick(e)
      },
      {
        type: 'separator'
      },
      {
        label: i18n.__('Export Storage'),
        submenu: [
          {
            label: i18n.__('Export as Plain Text (.txt)'),
            click: e => this.handleExportStorageClick(e, 'txt')
          },
          {
            label: i18n.__('Export as Markdown (.md)'),
            click: e => this.handleExportStorageClick(e, 'md')
          },
          {
            label: i18n.__('Export as HTML (.html)'),
            click: e => this.handleExportStorageClick(e, 'html')
          },
          {
            label: i18n.__('Export as PDF (.pdf)'),
            click: e => this.handleExportStorageClick(e, 'pdf')
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: i18n.__('Unlink Storage'),
        click: e => this.handleUnlinkStorageClick(e)
      }
    ])
  }

  handleUnlinkStorageClick(e) {
    const index = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      message: i18n.__('Unlink Storage'),
      detail: i18n.__(
        "This work will just detatches a storage from The Boosters. (Any data won't be deleted.)"
      ),
      buttons: [i18n.__('Confirm'), i18n.__('Cancel')]
    })

    if (index === 0) {
      const { storage, dispatch } = this.props
      dataApi
        .removeStorage(storage.key)
        .then(() => {
          dispatch({
            type: 'REMOVE_STORAGE',
            storageKey: storage.key
          })
        })
        .catch(err => {
          throw err
        })
    }
  }

  handleExportStorageClick(e, fileType) {
    const options = {
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: i18n.__('Select directory'),
      title: i18n.__('Select a folder to export the files to'),
      multiSelections: false
    }
    dialog
      .showOpenDialog(remote.getCurrentWindow(), options)
      .then(({ canceled, filePaths }) => {
        const paths = filePaths
        if (!canceled && paths && paths.length === 1) {
          const { storage, dispatch, config } = this.props
          dataApi
            .exportStorage(storage.key, fileType, paths[0], config)
            .then(data => {
              dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                type: 'info',
                message: `Exported to ${paths[0]}`
              })

              dispatch({
                type: 'EXPORT_STORAGE',
                storage: data.storage,
                fileType: data.fileType
              })
            })
            .catch(error => {
              dialog.showErrorBox(
                'Export error',
                error
                  ? error.message || error
                  : 'Unexpected error during export'
              )
              throw error
            })
        }
      })
  }

  handleToggleButtonClick(e) {
    const { storage, dispatch } = this.props
    const isOpen = !this.state.isOpen
    dataApi.toggleStorage(storage.key, isOpen).then(storage => {
      dispatch({
        type: 'EXPAND_STORAGE',
        storage,
        isOpen
      })
    })
    this.setState({
      isOpen: isOpen
    })
  }

  handleAddFolderButtonClick(e) {
    const { storage } = this.props

    modal.open(CreateFolderModal, {
      storage
    })
  }

  /** 親フォルダの配下に作る。パスは自動で前置される */
  handleAddSubfolderClick(parentPath) {
    const { storage } = this.props
    modal.open(CreateFolderModal, {
      storage,
      parentPath
    })
  }

  handleHeaderInfoClick(e) {
    const { storage, dispatch } = this.props
    dispatch(push('/storages/' + storage.key))
  }

  handleFolderButtonClick(folderKey) {
    return e => {
      const { storage, dispatch } = this.props
      dispatch(push('/storages/' + storage.key + '/folders/' + folderKey))
    }
  }

  handleFolderMouseEnter(e, tooltipRef, isFolded) {
    if (isFolded) {
      const buttonEl = e.currentTarget
      const tooltipEl = tooltipRef.current

      tooltipEl.style.top = buttonEl.getBoundingClientRect().y + 'px'
    }
  }

  handleFolderButtonContextMenu(e, folder) {
    // 右クリック位置をポップオーバーの基準にする（メニューは非同期に閉じるので
    // 先に控えておく。event は popup 後に使えなくなる）
    const anchor = { x: e.clientX, y: e.clientY }
    context.popup([
      {
        label: i18n.__('Rename Folder'),
        click: e => this.handleRenameFolderClick(e, folder)
      },
      {
        // 色名のテキストだけでは実際の色が想起できないため、色見本を
        // 実描画できるモーダルを開く（ネイティブメニューは PNG しか
        // アイコンにできず、色見本を動的に作れない）
        label: i18n.__('Change Folder Color'),
        click: () => this.handleFolderColorClick(folder, anchor)
      },
      {
        // ここから作れば「どこに作られるか」が明示され、パス表記を
        // 手打ちしなくてよい
        label: i18n.__('Add Subfolder'),
        click: () => this.handleAddSubfolderClick(folder.name)
      },
      {
        type: 'separator'
      },
      {
        label: i18n.__('Export Folder'),
        submenu: [
          {
            label: i18n.__('Export as Plain Text (.txt)'),
            click: e => this.handleExportFolderClick(e, folder, 'txt')
          },
          {
            label: i18n.__('Export as Markdown (.md)'),
            click: e => this.handleExportFolderClick(e, folder, 'md')
          },
          {
            label: i18n.__('Export as HTML (.html)'),
            click: e => this.handleExportFolderClick(e, folder, 'html')
          },
          {
            label: i18n.__('Export as PDF (.pdf)'),
            click: e => this.handleExportFolderClick(e, folder, 'pdf')
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: i18n.__('Delete Folder'),
        click: e => this.handleFolderDeleteClick(e, folder)
      }
    ])
  }

  handleFolderColorClick(folder, anchor) {
    this.setState({
      colorPopover: { folder, x: anchor.x, y: anchor.y }
    })
  }

  handleFolderColorSelect(color) {
    const { storage, dispatch } = this.props
    const { colorPopover } = this.state
    if (!colorPopover) return
    const folder = colorPopover.folder
    dataApi
      // updateFolder は name が文字列でないと reject するので現在名を渡す
      .updateFolder(storage.key, folder.key, { name: folder.name, color })
      .then(data => {
        dispatch({ type: 'UPDATE_FOLDER', storage: data.storage })
      })
      .catch(err => {
        console.error('Could not change the folder color', err)
      })
  }

  handleRenameFolderClick(e, folder) {
    const { storage } = this.props
    modal.open(RenameFolderModal, {
      storage,
      folder
    })
  }

  handleExportFolderClick(e, folder, fileType) {
    const options = {
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: i18n.__('Select directory'),
      title: i18n.__('Select a folder to export the files to'),
      multiSelections: false
    }
    dialog
      .showOpenDialog(remote.getCurrentWindow(), options)
      .then(({ canceled, filePaths }) => {
        const paths = filePaths
        if (!canceled && paths && paths.length === 1) {
          const { storage, dispatch, config } = this.props
          dataApi
            .exportFolder(storage.key, folder.key, fileType, paths[0], config)
            .then(data => {
              dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                type: 'info',
                message: `Exported to ${paths[0]}`
              })

              dispatch({
                type: 'EXPORT_FOLDER',
                storage: data.storage,
                folderKey: data.folderKey,
                fileType: data.fileType
              })
            })
            .catch(error => {
              dialog.showErrorBox(
                'Export error',
                error
                  ? error.message || error
                  : 'Unexpected error during export'
              )
              throw error
            })
        }
      })
  }

  handleFolderDeleteClick(e, folder) {
    const index = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      message: i18n.__('Delete Folder'),
      detail: i18n.__(
        'This will delete all notes in the folder and can not be undone.'
      ),
      buttons: [i18n.__('Confirm'), i18n.__('Cancel')]
    })

    if (index === 0) {
      const { storage, dispatch } = this.props
      dataApi.deleteFolder(storage.key, folder.key).then(data => {
        dispatch({
          type: 'DELETE_FOLDER',
          storage: data.storage,
          folderKey: data.folderKey
        })
      })
    }
  }

  handleDragEnter(e, key) {
    e.preventDefault()
    if (this.state.draggedOver === key) {
      return
    }
    this.setState({
      draggedOver: key
    })
  }

  handleDragLeave(e) {
    e.preventDefault()
    if (this.state.draggedOver === null) {
      return
    }
    this.setState({
      draggedOver: null
    })
  }

  dropNote(storage, folder, dispatch, location, noteData) {
    moveNotesToFolder(noteData, storage.key, folder.key, dispatch)
  }

  handleDrop(e, storage, folder, dispatch, location) {
    e.preventDefault()
    if (this.state.draggedOver !== null) {
      this.setState({
        draggedOver: null
      })
    }
    let noteData
    try {
      // An empty/invalid payload (e.g. a non-note drag) throws — ignore the drop.
      noteData = JSON.parse(e.dataTransfer.getData('note'))
    } catch (err) {
      return
    }
    // Only our own note drags carry an array of notes; ignore anything else.
    if (!Array.isArray(noteData)) return
    this.dropNote(storage, folder, dispatch, location, noteData)
  }

  render() {
    const {
      storage,
      location,
      isFolded,
      data,
      dispatch,
      jumpHintOffset,
      showJumpHint
    } = this.props
    const { folderNoteMap, trashedSet } = data
    const SortableStorageItemChild = SortableElement(StorageItemChild)

    // フォルダ名のパス表記からツリーを導出する。boostnote.json は平坦なまま
    const tree = buildFolderTree(storage.folders)
    const hasNesting = tree.some(node => node.children.length > 0)
    // 並び替え D&D は storage.folders の配列添字を前提にしている。ツリーでは
    // 画面上の並びと配列の並びが一致しないので、掴めると**画面上とは別の
    // フォルダを動かして boostnote.json に書き込む**。
    // 嘘のジェスチャを見せるより機能が無い方がましなので、ネストがある時だけ
    // ハンドルを隠す（平坦なストレージは今までどおり並び替えできる）
    const showReorderHandle = !hasNesting

    // 選択中フォルダの祖先は開いておく（現在地を見失わない）
    const activeFolder = storage.folders.find(folder =>
      location.pathname.match(
        new RegExp(
          escapeStringRegexp(path.sep) +
            'storages' +
            escapeStringRegexp(path.sep) +
            storage.key +
            escapeStringRegexp(path.sep) +
            'folders' +
            escapeStringRegexp(path.sep) +
            folder.key
        )
      )
    )
    const forcedOpen = new Set(
      activeFolder ? ancestorPaths(activeFolder.name) : []
    )

    const countNotes = node => {
      // 子孫の合計。中間ノードは実体を持たないことがあるので key を集めて足す
      let total = 0
      collectFolderKeys(node).forEach(folderKey => {
        const noteSet = folderNoteMap.get(storage.key + '-' + folderKey)
        if (!noteSet) return
        const noteKeys = noteSet.map(noteKey => noteKey)
        let trashedNoteCount = 0
        trashedSet.toJS().forEach(trashedKey => {
          if (noteKeys.some(noteKey => noteKey === trashedKey)) {
            trashedNoteCount++
          }
        })
        total += noteSet.size - trashedNoteCount
      })
      return total
    }

    // react-sortable-hoc の index は storage.folders の添字と一致させる。
    // 画面順で採番すると、並び替えが別のフォルダを動かす
    const arrayIndexOf = folder => storage.folders.indexOf(folder)

    let renderedCount = 0
    const renderNode = node => {
      const folder = node.folder
      const isNodeActive = !!(
        folder &&
        location.pathname.match(
          new RegExp(
            escapeStringRegexp(path.sep) +
              'storages' +
              escapeStringRegexp(path.sep) +
              storage.key +
              escapeStringRegexp(path.sep) +
              'folders' +
              escapeStringRegexp(path.sep) +
              folder.key
          )
        )
      )
      const tooltipRef = React.createRef(null)
      const hasChildren = node.children.length > 0
      const isExpanded =
        !this.state.collapsedPaths.has(node.path) || forcedOpen.has(node.path)
      // 番号ジャンプは**画面に出ている行**の順に振る。配列添字で振ると、
      // 折りたたみで隠れた行が番号を食って画面の並びとずれる
      const visibleIndex = renderedCount++
      const jumpHint =
        jumpHintOffset && jumpHintOffset + visibleIndex <= 9
          ? jumpHintOffset + visibleIndex
          : null

      const row = (
        <SortableStorageItemChild
          key={node.path}
          index={folder ? arrayIndexOf(folder) : -1}
          disabled={!showReorderHandle || !folder}
          jumpHint={jumpHint}
          showJumpHint={showJumpHint}
          isActive={
            isNodeActive || (folder && folder.key === this.state.draggedOver)
          }
          tooltipRef={tooltipRef}
          depth={node.depth}
          fullPath={node.path}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={() => this.toggleFolderExpand(node.path)}
          showReorderHandle={showReorderHandle}
          handleButtonClick={e => {
            // 実体のない中間ノードは選べない（選ばせるとルーティングが
            // 未知の folderKey になり、NoteList がストレージ全件へ
            // 黙ってフォールバックする）。代わりに開閉する
            if (!folder) {
              this.toggleFolderExpand(node.path)
              return
            }
            this.handleFolderButtonClick(folder.key)(e)
          }}
          handleMouseEnter={e =>
            this.handleFolderMouseEnter(e, tooltipRef, isFolded)
          }
          handleContextMenu={e => {
            // 中間ノードには削除・リネームのメニューを出さない。
            // folder が無い状態で削除へ進むと folderKey が undefined になり、
            // `folder` フィールドを持たない .cson が軒並み一致して消える
            if (!folder) return
            this.handleFolderButtonContextMenu(e, folder)
          }}
          folderName={
            // node.name は既に葉の名前。leafName(node.path) を使うと、
            // 名前が空のフォルダで path に混ぜた key（' a1b2c3d4'）が
            // そのまま表示名になり、利用者には意味不明な文字列に見える
            node.name || i18n.__('Untitled folder')
          }
          folderColor={folder ? folder.color : undefined}
          isFolded={isFolded}
          noteCount={countNotes(node)}
          handleDrop={e => {
            if (!folder) return
            this.handleDrop(e, storage, folder, dispatch, location)
          }}
          handleDragEnter={e => {
            if (!folder) return
            this.handleDragEnter(e, folder.key)
          }}
          handleDragLeave={e => {
            if (!folder) return
            this.handleDragLeave(e, folder)
          }}
        />
      )

      if (!hasChildren || !isExpanded || isFolded) return [row]
      return [row].concat(...node.children.map(renderNode))
    }

    const folderList = [].concat(...tree.map(renderNode))

    const isActive = location.pathname.match(
      new RegExp(
        escapeStringRegexp(path.sep) +
          'storages' +
          escapeStringRegexp(path.sep) +
          storage.key +
          '$'
      )
    )

    return (
      <div styleName={isFolded ? 'root--folded' : 'root'} key={storage.key}>
        <div
          styleName={isActive ? 'header--active' : 'header'}
          onContextMenu={e => this.handleHeaderContextMenu(e)}
        >
          <button
            styleName='header-toggleButton'
            onMouseDown={e => this.handleToggleButtonClick(e)}
          >
            <img
              src={
                this.state.isOpen
                  ? '../resources/icon/icon-down.svg'
                  : '../resources/icon/icon-right.svg'
              }
            />
          </button>

          {!isFolded && (
            <button
              styleName='header-addFolderButton'
              onClick={e => this.handleAddFolderButtonClick(e)}
            >
              <img src='../resources/icon/icon-plus.svg' />
            </button>
          )}

          <button
            styleName='header-info'
            onClick={e => this.handleHeaderInfoClick(e)}
          >
            <span>
              {isFolded
                ? _.truncate(storage.name, { length: 1, omission: '' })
                : storage.name}
            </span>
            {isFolded && (
              <span styleName='header-info--folded-tooltip'>
                {storage.name}
              </span>
            )}
          </button>
        </div>
        {this.state.isOpen && <div>{folderList}</div>}
        {this.state.colorPopover && (
          <FolderColorPopover
            x={this.state.colorPopover.x}
            y={this.state.colorPopover.y}
            value={this.state.colorPopover.folder.color}
            label={i18n.__('Change Folder Color')}
            onSelect={color => this.handleFolderColorSelect(color)}
            onClose={() => this.setState({ colorPopover: null })}
          />
        )}
      </div>
    )
  }
}

StorageItem.propTypes = {
  isFolded: PropTypes.bool
}

export default CSSModules(StorageItem, styles)
