import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './RenameModal.styl'
import dataApi from 'browser/main/lib/dataApi'
import { store } from 'browser/main/store'
import ModalEscButton from 'browser/components/ModalEscButton'
import i18n from 'browser/lib/i18n'
import consts from 'browser/lib/consts'

class RenameFolderModal extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      name: props.folder.name,
      color: props.folder.color
    }
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
    if (this.state.name.trim().length > 0) {
      const { storage, folder } = this.props
      dataApi
        .updateFolder(storage.key, folder.key, {
          name: this.state.name,
          color: this.state.color
        })
        .then(data => {
          store.dispatch({
            type: 'UPDATE_FOLDER',
            storage: data.storage
          })
          this.props.close()
        })
    }
  }

  render() {
    return (
      <div
        styleName='root'
        tabIndex='-1'
        onKeyDown={e => this.handleKeyDown(e)}
      >
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Rename Folder')}</div>
        </div>
        <ModalEscButton
          handleEscButtonClick={e => this.handleCloseButtonClick(e)}
        />

        <div styleName='control'>
          <input
            styleName='control-input'
            placeholder={i18n.__('Folder Name')}
            ref='name'
            value={this.state.name}
            onChange={e => this.handleChange(e)}
            onKeyDown={e => this.handleInputKeyDown(e)}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              margin: '0 auto 15px'
            }}
          >
            {consts.FOLDER_COLORS.map(c => (
              <button
                key={c}
                title={c}
                onClick={() => this.setState({ color: c })}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: c,
                  border:
                    this.state.color === c
                      ? '3px solid #fff'
                      : '2px solid transparent',
                  outline: this.state.color === c ? `2px solid ${c}` : 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              />
            ))}
          </div>
          <button
            styleName='control-confirmButton'
            onClick={e => this.handleConfirmButtonClick(e)}
          >
            {i18n.__('Confirm')}
          </button>
        </div>
      </div>
    )
  }
}

RenameFolderModal.propTypes = {
  storage: PropTypes.shape({
    key: PropTypes.string
  }),
  folder: PropTypes.shape({
    key: PropTypes.string,
    name: PropTypes.string,
    color: PropTypes.string
  })
}

export default CSSModules(RenameFolderModal, styles)
