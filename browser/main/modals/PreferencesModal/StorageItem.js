import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './StorageItem.styl'
import consts from 'browser/lib/consts'
import dataApi from 'browser/main/lib/dataApi'
import store from 'browser/main/store'
import FolderList from './FolderList'

const { shell, remote } = require('electron')
const { dialog } = remote

class StorageItem extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      isLabelEditing: false
    }
  }

  handleNewFolderButtonClick (e) {
    let { storage } = this.props
    let input = {
      name: 'Untitled',
      color: consts.FOLDER_COLORS[Math.floor(Math.random() * 7) % 7]
    }

    dataApi.createFolder(storage.key, input)
      .then((data) => {
        store.dispatch({
          type: 'UPDATE_FOLDER',
          storage: data.storage
        })
      })
      .catch((err) => {
        console.error(err)
      })
  }

  handleExternalButtonClick () {
    let { storage } = this.props
    shell.showItemInFolder(storage.path)
  }

  handleUnlinkButtonClick (e) {
    let index = dialog.showMessageBox(remote.getCurrentWindow(), {
      type: 'warning',
      message: 'Unlink Storage',
      detail: 'Unlinking removes this linked storage from Boostnote. No data is removed, please manually delete the folder from your hard drive if needed.',
      buttons: ['Unlink', 'Cancel']
    })

    if (index === 0) {
      let { storage } = this.props
      dataApi.removeStorage(storage.key)
        .then(() => {
          store.dispatch({
            type: 'REMOVE_STORAGE',
            storageKey: storage.key
          })
        })
        .catch((err) => {
          throw err
        })
    }
  }

  handleLabelClick (e) {
    let { storage } = this.props
    this.setState({
      isLabelEditing: true,
      name: storage.name
    }, () => {
      this.refs.label.focus()
    })
  }
  handleLabelChange (e) {
    this.setState({
      name: this.refs.label.value
    })
  }

  handleLabelBlur (e) {
    let { storage } = this.props
    dataApi
      .renameStorage(storage.key, this.state.name)
      .then((_storage) => {
        store.dispatch({
          type: 'RENAME_STORAGE',
          storage: _storage
        })
        this.setState({
          isLabelEditing: false
        })
      })
  }

  render () {
    let { storage, hostBoundingBox } = this.props

    return (
      <div styleName='root' key={storage.key}>
        <div styleName='header'>
          {this.state.isLabelEditing
            ? <div styleName='header-label--edit'>
              <input styleName='header-label-input'
                value={this.state.name}
                ref='label'
                onChange={(e) => this.handleLabelChange(e)}
                onBlur={(e) => this.handleLabelBlur(e)}
              />
            </div>
            : <div styleName='header-label'
              onClick={(e) => this.handleLabelClick(e)}
            >
              <i className='fa fa-folder-open' />&nbsp;
              {storage.name}&nbsp;
              <span styleName='header-label-path'>({storage.path})</span>&nbsp;
              <i styleName='header-label-editButton' className='fa fa-pencil' />
            </div>
          }
          <div styleName='header-control'>
            <button styleName='header-control-button'
              onClick={(e) => this.handleNewFolderButtonClick(e)}
            >
              <i className='fa fa-plus' />
              <span styleName='header-control-button-tooltip'
                style={{left: -20}}
              >Add Folder</span>
            </button>
            <button styleName='header-control-button'
              onClick={(e) => this.handleExternalButtonClick(e)}
            >
              <i className='fa fa-external-link' />
              <span styleName='header-control-button-tooltip'
                style={{left: -50}}
              >Open Storage folder</span>
            </button>
            <button styleName='header-control-button'
              onClick={(e) => this.handleUnlinkButtonClick(e)}
            >
              <i className='fa fa-unlink' />
              <span styleName='header-control-button-tooltip'
                style={{left: -10}}
              >Unlink</span>
            </button>
          </div>
        </div>
        <FolderList storage={storage}
          hostBoundingBox={hostBoundingBox}
        />
      </div>
    )
  }
}

StorageItem.propTypes = {
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
  })
}

export default CSSModules(StorageItem, styles)
