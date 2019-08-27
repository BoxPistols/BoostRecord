import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './StoragesTab.styl'
import dataApi from 'browser/main/lib/dataApi'
import attachmentManagement from 'browser/main/lib/dataApi/attachmentManagement'
import StorageItem from './StorageItem'
import i18n from 'browser/lib/i18n'
import fs from 'fs'

const electron = require('electron')
const { shell, remote } = electron

function browseFolder () {
  const dialog = remote.dialog

  const defaultPath = remote.app.getPath('home')
  return new Promise((resolve, reject) => {
    dialog.showOpenDialog({
      title: i18n.__('Select Directory'),
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }, function (targetPaths) {
      if (targetPaths == null) return resolve('')
      resolve(targetPaths[0])
    })
  })
}

function humanFileSize (bytes) {
  const threshold = 1000
  if (Math.abs(bytes) < threshold) {
    return bytes + ' B'
  }
  var units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  var u = -1
  do {
    bytes /= threshold
    ++u
  } while (Math.abs(bytes) >= threshold && u < units.length - 1)
  return bytes.toFixed(1) + ' ' + units[u]
}

class StoragesTab extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      page: 'LIST',
      newStorage: {
        name: 'Unnamed',
        type: 'FILESYSTEM',
        path: ''
      },
      attachments: []
    }
    this.loadAttachmentStorage()
  }

  loadAttachmentStorage () {
    const promises = []
    this.props.data.noteMap.map(note => {
      const promise = attachmentManagement.getAttachments(
        note.content,
        note.storage,
        note.key
      )
      if (promise) promises.push(promise)
    })

    Promise.all(promises)
      .then(data => this.setState({attachments: data}))
      .catch(console.error)
  }

  handleAddStorageButton (e) {
    this.setState({
      page: 'ADD_STORAGE',
      newStorage: {
        name: 'Unnamed',
        type: 'FILESYSTEM',
        path: ''
      }
    }, () => {
      this.refs.addStorageName.select()
    })
  }

  handleLinkClick (e) {
    shell.openExternal(e.currentTarget.href)
    e.preventDefault()
  }

  removeAllAttachments (attachments) {
    const promises = []
    for (const attachment of attachments) {
      for (const file of attachment) {
        const promise = new Promise((resolve, reject) => {
          fs.unlink(file, (err) => {
            if (err) {
              console.error('Could not delete "%s"', file)
              console.error(err)
              reject(err)
              return
            }
            resolve()
          })
        })
        promises.push(promise)
      }
    }
    Promise.all(promises)
      .then(() => this.loadAttachmentStorage())
      .catch(console.error)
  }

  renderList () {
    const { data, boundingBox } = this.props
    const { attachments } = this.state

    const totalUnusedAttachments = attachments
      .reduce((acc, curr) => acc + curr.attachmentsNotInNotePaths.length, 0)
    const totalInuseAttachments = attachments
      .reduce((acc, curr) => acc + curr.attachmentsInNotePaths.length, 0)
    const totalAttachments = totalUnusedAttachments + totalInuseAttachments

    const unusedAttachments = attachments.reduce((acc, curr) => {
      acc.push(curr.attachmentsNotInNotePaths)
      return acc
    }, [])

    const totalUnusedAttachmentsSize = attachments
      .reduce((acc, curr) => {
        return acc + curr.attachmentsNotInNotePaths.reduce((racc, rcurr) => {
          const stats = fs.statSync(rcurr)
          const fileSizeInBytes = stats.size
          return racc + fileSizeInBytes
        }, 0)
      }, 0)
    const totalInuseAttachmentsSize = attachments
      .reduce((acc, curr) => {
        return acc + curr.attachmentsInNotePaths.reduce((racc, rcurr) => {
          const stats = fs.statSync(rcurr)
          const fileSizeInBytes = stats.size
          return racc + fileSizeInBytes
        }, 0)
      }, 0)
    const totalAttachmentsSize = totalUnusedAttachmentsSize + totalInuseAttachmentsSize

    if (!boundingBox) { return null }
    const storageList = data.storageMap.map((storage) => {
      return <StorageItem
        key={storage.key}
        storage={storage}
        hostBoundingBox={boundingBox}
      />
    })
    return (
      <div styleName='list'>
        <div styleName='header'>{i18n.__('Storage Locations')}</div>
        {storageList.length > 0
          ? storageList
          : <div styleName='list-empty'>{i18n.__('No storage found.')}</div>
        }
        <div styleName='list-control'>
          <button styleName='list-control-addStorageButton'
            onClick={(e) => this.handleAddStorageButton(e)}
          >
            <i className='fa fa-plus' /> {i18n.__('Add Storage Location')}
          </button>
        </div>
        <div styleName='header'>{i18n.__('Attachment storage')}</div>
        <p styleName='list-attachment-label'>
          Unused attachments size: {humanFileSize(totalUnusedAttachmentsSize)} ({totalUnusedAttachments} items)
        </p>
        <p styleName='list-attachment-label'>
          In use attachments size: {humanFileSize(totalInuseAttachmentsSize)} ({totalInuseAttachments} items)
        </p>
        <p styleName='list-attachment-label'>
          Total attachments size: {humanFileSize(totalAttachmentsSize)} ({totalAttachments} items)
        </p>
        <button styleName='list-attachement-clear-button' onClick={() => this.removeAllAttachments(unusedAttachments)}>
          {i18n.__('Clear unused attachments')}
        </button>
      </div>
    )
  }

  handleAddStorageBrowseButtonClick (e) {
    browseFolder()
      .then((targetPath) => {
        if (targetPath.length > 0) {
          const { newStorage } = this.state
          newStorage.path = targetPath
          this.setState({
            newStorage
          })
        }
      })
      .catch((err) => {
        console.error('BrowseFAILED')
        console.error(err)
      })
  }

  handleAddStorageChange (e) {
    const { newStorage } = this.state
    newStorage.name = this.refs.addStorageName.value
    newStorage.path = this.refs.addStoragePath.value
    this.setState({
      newStorage
    })
  }

  handleAddStorageCreateButton (e) {
    dataApi
      .addStorage({
        name: this.state.newStorage.name,
        path: this.state.newStorage.path
      })
      .then((data) => {
        const { dispatch } = this.props
        dispatch({
          type: 'ADD_STORAGE',
          storage: data.storage,
          notes: data.notes
        })
        this.setState({
          page: 'LIST'
        })
      })
  }

  handleAddStorageCancelButton (e) {
    this.setState({
      page: 'LIST'
    })
  }

  renderAddStorage () {
    return (
      <div styleName='addStorage'>

        <div styleName='addStorage-header'>{i18n.__('Add Storage')}</div>

        <div styleName='addStorage-body'>

          <div styleName='addStorage-body-section'>
            <div styleName='addStorage-body-section-label'>
              {i18n.__('Name')}
            </div>
            <div styleName='addStorage-body-section-name'>
              <input styleName='addStorage-body-section-name-input'
                ref='addStorageName'
                value={this.state.newStorage.name}
                onChange={(e) => this.handleAddStorageChange(e)}
              />
            </div>
          </div>

          <div styleName='addStorage-body-section'>
            <div styleName='addStorage-body-section-label'>{i18n.__('Type')}</div>
            <div styleName='addStorage-body-section-type'>
              <select styleName='addStorage-body-section-type-select'
                value={this.state.newStorage.type}
                readOnly
              >
                <option value='FILESYSTEM'>{i18n.__('File System')}</option>
              </select>
              <div styleName='addStorage-body-section-type-description'>
                {i18n.__('Setting up 3rd-party cloud storage integration:')}{' '}
                <a href='https://github.com/BoostIO/Boostnote/wiki/Cloud-Syncing-and-Backup'
                  onClick={(e) => this.handleLinkClick(e)}
                >{i18n.__('Cloud-Syncing-and-Backup')}</a>
              </div>
            </div>
          </div>

          <div styleName='addStorage-body-section'>
            <div styleName='addStorage-body-section-label'>{i18n.__('Location')}
            </div>
            <div styleName='addStorage-body-section-path'>
              <input styleName='addStorage-body-section-path-input'
                ref='addStoragePath'
                placeholder={i18n.__('Select Folder')}
                value={this.state.newStorage.path}
                onChange={(e) => this.handleAddStorageChange(e)}
              />
              <button styleName='addStorage-body-section-path-button'
                onClick={(e) => this.handleAddStorageBrowseButtonClick(e)}
              >
                ...
              </button>
            </div>
          </div>

          <div styleName='addStorage-body-control'>
            <button styleName='addStorage-body-control-createButton'
              onClick={(e) => this.handleAddStorageCreateButton(e)}
            >{i18n.__('Add')}</button>
            <button styleName='addStorage-body-control-cancelButton'
              onClick={(e) => this.handleAddStorageCancelButton(e)}
            >{i18n.__('Cancel')}</button>
          </div>

        </div>

      </div>
    )
  }

  renderContent () {
    switch (this.state.page) {
      case 'ADD_STORAGE':
      case 'ADD_FOLDER':
        return this.renderAddStorage()
      case 'LIST':
      default:
        return this.renderList()
    }
  }

  render () {
    return (
      <div styleName='root'>
        {this.renderContent()}
      </div>
    )
  }
}

StoragesTab.propTypes = {
  boundingBox: PropTypes.shape({
    bottom: PropTypes.number,
    height: PropTypes.number,
    left: PropTypes.number,
    right: PropTypes.number,
    top: PropTypes.number,
    width: PropTypes.number
  }),
  dispatch: PropTypes.func
}

export default CSSModules(StoragesTab, styles)
