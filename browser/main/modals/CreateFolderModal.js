import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './CreateFolderModal.styl'
import dataApi from 'browser/main/lib/dataApi'
import { store } from 'browser/main/store'
import consts from 'browser/lib/consts'
import ModalEscButton from 'browser/components/ModalEscButton'
import AwsMobileAnalyticsConfig from 'browser/main/lib/AwsMobileAnalyticsConfig'
import i18n from 'browser/lib/i18n'
import { childPath, splitPath } from 'browser/lib/folderTree'

class CreateFolderModal extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      name: '',
      error: null
    }
  }

  // 親フォルダから作る時は、その配下に入るようパスを前置する。
  // 利用者が 'PR-1281' と打てば 'KSD/onboarding/PR-1281' になる
  buildName() {
    const typed = this.state.name.trim()
    const parent = this.props.parentPath || ''
    return parent ? childPath(parent, typed) : typed
  }

  componentDidMount() {
    this.refs.name.focus()
    this.refs.name.select()
  }

  handleCloseButtonClick(e) {
    this.props.close()
  }

  handleChange(e) {
    this.setState({
      name: this.refs.name.value
    })
  }

  handleKeyDown(e) {
    if (e.keyCode === 27) {
      this.props.close()
    }
  }

  handleInputKeyDown(e) {
    switch (e.keyCode) {
      case 13:
        this.confirm()
    }
  }

  handleConfirmButtonClick(e) {
    this.confirm()
  }

  confirm() {
    AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_FOLDER')
    // 入力そのものが空の時に親パスだけで作ろうとすると、dataApi が
    // 「同じパスが既にある」で拒否し、名前未入力だと伝わらない。先に止める
    if (splitPath(this.state.name).length === 0) {
      this.setState({ error: i18n.__('Please enter a folder name') })
      return
    }
    const name = this.buildName()
    if (splitPath(name).length === 0) {
      this.setState({ error: i18n.__('Please enter a folder name') })
      return
    }
    const { storage } = this.props
    const input = {
      name,
      color: consts.FOLDER_COLORS[Math.floor(Math.random() * 7) % 7]
    }

    dataApi
      .createFolder(storage.key, input)
      .then(data => {
        store.dispatch({
          type: 'UPDATE_FOLDER',
          storage: data.storage
        })
        this.props.close()
      })
      .catch(err => {
        // console.error だけだと、拒否された時にモーダルが開いたまま
        // 無言で固まる（同じパスが既にある場合など）
        console.error(err)
        this.setState({
          error: (err && err.message) || i18n.__('Could not create the folder')
        })
      })
  }

  render() {
    return (
      <div
        styleName='root'
        tabIndex='-1'
        onKeyDown={e => this.handleKeyDown(e)}
      >
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Create new folder')}</div>
          {this.props.parentPath && (
            // どこに作られるのかを見せる。前置は暗黙なので、出さないと
            // 「打った名前と違うフォルダができた」ように見える
            <div styleName='parent-path' title={this.props.parentPath}>
              {`${this.props.parentPath}/`}
            </div>
          )}
        </div>
        <ModalEscButton
          handleEscButtonClick={e => this.handleCloseButtonClick(e)}
        />
        <div styleName='control'>
          <div styleName='control-folder'>
            <div styleName='control-folder-label'>{i18n.__('Folder name')}</div>
            <input
              styleName='control-folder-input'
              ref='name'
              value={this.state.name}
              onChange={e => this.handleChange(e)}
              onKeyDown={e => this.handleInputKeyDown(e)}
            />
            <div styleName='control-folder-hint'>
              {i18n.__('Use / to nest folders (e.g. KSD/onboarding)')}
            </div>
            {this.state.error && (
              <div styleName='control-folder-error'>{this.state.error}</div>
            )}
          </div>
          <button
            styleName='control-confirmButton'
            onClick={e => this.handleConfirmButtonClick(e)}
          >
            {i18n.__('Create')}
          </button>
        </div>
      </div>
    )
  }
}

CreateFolderModal.propTypes = {
  parentPath: PropTypes.string,
  storage: PropTypes.shape({
    key: PropTypes.string
  })
}

export default CSSModules(CreateFolderModal, styles)
