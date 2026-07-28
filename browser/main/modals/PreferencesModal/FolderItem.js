import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'

import styles from './FolderItem.styl'
import dataApi from 'browser/main/lib/dataApi'
import { store } from 'browser/main/store'
import FolderColorSwatches from 'browser/components/FolderColorSwatches'
import { SortableElement, SortableHandle } from 'react-sortable-hoc'
import i18n from 'browser/lib/i18n'

class FolderItem extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      status: 'IDLE',
      folder: {
        showColumnPicker: false,
        colorPickerPos: { left: 0, top: 0 },
        color: props.color,
        name: props.name
      }
    }
  }

  handleEditChange(e) {
    const { folder } = this.state

    folder.name = this.refs.nameInput.value
    this.setState({
      folder
    })
  }

  handleConfirmButtonClick(e) {
    this.confirm()
  }

  confirm() {
    const { storage, folder } = this.props
    dataApi
      .updateFolder(storage.key, folder.key, {
        color: this.state.folder.color,
        name: this.state.folder.name
      })
      .then(data => {
        store.dispatch({
          type: 'UPDATE_FOLDER',
          storage: data.storage
        })
        this.setState({
          status: 'IDLE'
        })
      })
  }

  handleColorButtonClick(e) {
    // 開閉のみ。位置補正は不要になった（インライン表示にしたため）
    const folder = Object.assign({}, this.state.folder, {
      showColumnPicker: !this.state.folder.showColumnPicker
    })
    this.setState({ folder })
  }

  handleColorChange(color) {
    const folder = Object.assign({}, this.state.folder, {
      color,
      // 選んだら閉じる。開いたままだと編集行の高さが変わり続けて扱いにくい
      showColumnPicker: false
    })
    this.setState({ folder })
  }

  handleColorPickerClose(event) {
    const folder = Object.assign({}, this.state.folder, {
      showColumnPicker: false
    })
    this.setState({ folder })
  }

  handleCancelButtonClick(e) {
    this.setState({
      status: 'IDLE'
    })
  }

  handleFolderItemBlur(e) {
    let el = e.relatedTarget
    while (el != null) {
      if (el === this.refs.root) {
        return false
      }
      el = el.parentNode
    }
    this.confirm()
  }

  renderEdit(e) {
    return (
      <div
        styleName='folderItem'
        onBlur={e => this.handleFolderItemBlur(e)}
        tabIndex='-1'
        ref='root'
      >
        <div styleName='folderItem-left'>
          {/* 色見本は button の入れ子にしない。従来は SketchPicker と
              全画面を覆う cover div を <button> の内側に描いており、
              ピッカー操作のクリックがボタンへ伝播して cover が閉じず、
              画面全体がクリック不能になっていた（例外が出ないので
              「フリーズした」ようにしか見えなかった） */}
          <span
            styleName='folderItem-left-colorButton'
            style={{ color: this.state.folder.color }}
            role='button'
            tabIndex='0'
            title={i18n.__('Change Folder Color')}
            aria-expanded={!!this.state.folder.showColumnPicker}
            onClick={e => this.handleColorButtonClick(e)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                this.handleColorButtonClick(e)
              }
            }}
          >
            <i className='fa fa-square' />
          </span>
          <input
            styleName='folderItem-left-nameInput'
            value={this.state.folder.name}
            ref='nameInput'
            onChange={e => this.handleEditChange(e)}
          />
        </div>
        {this.state.folder.showColumnPicker && (
          <div style={{ flexBasis: '100%', padding: '10px 0 4px' }}>
            <FolderColorSwatches
              value={this.state.folder.color}
              onSelect={color => this.handleColorChange(color)}
            />
          </div>
        )}
        <div styleName='folderItem-right'>
          <button
            styleName='folderItem-right-confirmButton'
            onClick={e => this.handleConfirmButtonClick(e)}
          >
            {i18n.__('Confirm')}
          </button>
          <button
            styleName='folderItem-right-button'
            onClick={e => this.handleCancelButtonClick(e)}
          >
            {i18n.__('Cancel')}
          </button>
        </div>
      </div>
    )
  }

  handleDeleteConfirmButtonClick(e) {
    const { storage, folder } = this.props
    dataApi.deleteFolder(storage.key, folder.key).then(data => {
      store.dispatch({
        type: 'DELETE_FOLDER',
        storage: data.storage,
        folderKey: data.folderKey
      })
    })
  }

  renderDelete() {
    return (
      <div styleName='folderItem'>
        <div styleName='folderItem-left'>
          {i18n.__('Are you sure to ')}{' '}
          <span styleName='folderItem-left-danger'>{i18n.__(' delete')}</span>{' '}
          {i18n.__('this folder?')}
        </div>
        <div styleName='folderItem-right'>
          <button
            styleName='folderItem-right-dangerButton'
            onClick={e => this.handleDeleteConfirmButtonClick(e)}
          >
            {i18n.__('Confirm')}
          </button>
          <button
            styleName='folderItem-right-button'
            onClick={e => this.handleCancelButtonClick(e)}
          >
            {i18n.__('Cancel')}
          </button>
        </div>
      </div>
    )
  }

  handleEditButtonClick(e) {
    const { folder: propsFolder } = this.props
    const { folder: stateFolder } = this.state
    const folder = Object.assign({}, stateFolder, propsFolder)
    this.setState(
      {
        status: 'EDIT',
        folder
      },
      () => {
        this.refs.nameInput.select()
      }
    )
  }

  handleDeleteButtonClick(e) {
    this.setState({
      status: 'DELETE'
    })
  }

  renderIdle() {
    const { folder } = this.props
    return (
      <div
        styleName='folderItem'
        onDoubleClick={e => this.handleEditButtonClick(e)}
      >
        <div styleName='folderItem-left' style={{ borderColor: folder.color }}>
          <span>{folder.name}</span>
          <span styleName='folderItem-left-key'>({folder.key})</span>
        </div>
        <div styleName='folderItem-right'>
          <button
            styleName='folderItem-right-button'
            onClick={e => this.handleEditButtonClick(e)}
          >
            {i18n.__('Edit')}
          </button>
          <button
            styleName='folderItem-right-button'
            onClick={e => this.handleDeleteButtonClick(e)}
          >
            {i18n.__('Delete')}
          </button>
        </div>
      </div>
    )
  }

  render() {
    switch (this.state.status) {
      case 'DELETE':
        return this.renderDelete()
      case 'EDIT':
        return this.renderEdit()
      case 'IDLE':
      default:
        return this.renderIdle()
    }
  }
}

FolderItem.propTypes = {
  hostBoundingBox: PropTypes.shape({
    bottom: PropTypes.number,
    height: PropTypes.number,
    left: PropTypes.number,
    right: PropTypes.number,
    top: PropTypes.number,
    width: PropTypes.number
  }),
  storage: PropTypes.shape({
    key: PropTypes.string
  }),
  folder: PropTypes.shape({
    key: PropTypes.string,
    color: PropTypes.string,
    name: PropTypes.string
  })
}

class Handle extends React.Component {
  render() {
    return (
      <div styleName='folderItem-drag-handle'>
        <i className='fa fa-reorder' />
      </div>
    )
  }
}

class SortableFolderItemComponent extends React.Component {
  render() {
    const StyledHandle = CSSModules(Handle, styles)
    const DragHandle = SortableHandle(StyledHandle)

    const StyledFolderItem = CSSModules(FolderItem, styles)

    return (
      <div>
        <DragHandle />
        <StyledFolderItem {...this.props} />
      </div>
    )
  }
}

export default CSSModules(SortableElement(SortableFolderItemComponent), styles)
