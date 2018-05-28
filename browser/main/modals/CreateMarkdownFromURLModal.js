import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './CreateMarkdownFromURLModal.styl'
import dataApi from 'browser/main/lib/dataApi'
import store from 'browser/main/store'
import consts from 'browser/lib/consts'
import ModalEscButton from 'browser/components/ModalEscButton'
import AwsMobileAnalyticsConfig from 'browser/main/lib/AwsMobileAnalyticsConfig'
import i18n from 'browser/lib/i18n'

class CreateMarkdownFromURLModal extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      name: '',
      showerror: false,
      errormessage: ''
    }

  }

  componentDidMount () {
    this.refs.name.focus()
    this.refs.name.select()
  }

  handleCloseButtonClick (e) {
    this.props.close()
  }

  handleChange (e) {
    this.setState({
      name: this.refs.name.value
    })
  }

  handleKeyDown (e) {
    if (e.keyCode === 27) {
      this.props.close()
    }
  }

  handleInputKeyDown (e) {
    switch (e.keyCode) {
      case 13:
        this.confirm()
    }
  }

  handleConfirmButtonClick (e) {
    this.confirm()
  }

  showError (message) {
    this.setState({
      showerror: true,
      errormessage: message
    });
  }

  hideError () {
    this.setState({
      showerror: false,
      errormessage: ''
    })
  }

  confirm () {
      this.hideError()
      const { storage, folder, dispatch, location } = this.props

      let note = dataApi.createNoteFromUrl(this.state.name, storage, folder, dispatch, location).then((result) => {
        this.props.close()
      }).catch((result) => {
        this.showError(result.error);
      });
  }

  render () {
    return (
      <div styleName='root'
        tabIndex='-1'
        onKeyDown={(e) => this.handleKeyDown(e)}
      >
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Import Markdown From URL')}</div>
        </div>
        <ModalEscButton handleEscButtonClick={(e) => this.handleCloseButtonClick(e)} />
        <div styleName='control'>
          <div styleName='control-folder'>
            <div styleName='control-folder-label'>{i18n.__('Insert URL Here')}</div>
            <input styleName='control-folder-input'
              ref='name'
              value={this.state.name}
              onChange={(e) => this.handleChange(e)}
              onKeyDown={(e) => this.handleInputKeyDown(e)}
            />
          </div>
          <button styleName='control-confirmButton'
            onClick={(e) => this.handleConfirmButtonClick(e)}
          >
            {i18n.__('Import')}
          </button>
          <div className="error" styleName="error">{this.state.errormessage}</div>
        </div>
      </div>
    )
  }
}

CreateMarkdownFromURLModal.propTypes = {
  storage: PropTypes.shape({
    key: PropTypes.string
  })
}

export default CSSModules(CreateMarkdownFromURLModal, styles)
