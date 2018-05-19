import React from 'react'
import ConfigManager from 'browser/main/lib/ConfigManager'
import i18n from 'browser/lib/i18n'
import styles from './ConfigTab.styl'
import CSSModules from 'browser/lib/CSSModules'
import store from 'browser/main/store'

const electron = require('electron')
const ipc = electron.ipcRenderer

class Export extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      config: props.config
    }
  }

  componentDidMount () {
    this.handleSettingDone = () => {
      this.setState({ExportAlert: {
        type: 'success',
        message: i18n.__('Successfully applied!')
      }})
    }
    this.handleSettingError = (err) => {
      this.setState({ExportAlert: {
        type: 'error',
        message: err.message != null ? err.message : i18n.__('Error occurs!')
      }})
    }
    ipc.addListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.addListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  componentWillUnmount () {
    ipc.removeListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.removeListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  handleUIChange (e) {
    const newConfig = {
      exports: {
        escapeHtml: this.refs.escapeHtmlExport.checked
      }
    }

    this.setState({ config: newConfig }, () => {
      const { exports } = this.props.config
      this.currentConfig = { exports }
      if (_.isEqual(this.currentConfig, this.state.config)) {
        this.props.haveToSave()
      } else {
        this.props.haveToSave({
          tab: 'EXPORT',
          type: 'warning',
          message: i18n.__('You have to save!')
        })
      }
    })
  }

  handleSaveUIClick (e) {
    const newConfig = {
      exports: this.state.config.exports
    }

    ConfigManager.set(newConfig)

    store.dispatch({
      type: 'SET_UI',
      config: newConfig
    })
    this.clearMessage()
    this.props.haveToSave()
  }

  clearMessage () {
    _.debounce(() => {
      this.setState({
        UiAlert: null
      })
    }, 2000)()
  }

  render () {
    const ExportAlert = this.state.ExportAlert
    const ExportAlertElement = ExportAlert != null
      ? <p className={`alert ${ExportAlert.type}`}>
        {ExportAlert.message}
      </p>
      : null
    return (
      <div styleName='root'>
        <div styleName='group'>
          <div styleName='group-header'>{i18n.__('Export')}</div>

          <div styleName='group-checkBoxSection'>
            <label>
              <input onChange={(e) => this.handleUIChange(e)}
                checked={this.state.config.exports.escapeHtml}
                ref='escapeHtmlExport'
                type='checkbox'
              />&nbsp;
              {i18n.__('Escape HTML when export note as HTML')}
            </label>
          </div>
          <div styleName='group-control'>
            <button styleName='group-control-rightButton'
              onClick={(e) => this.handleSaveUIClick(e)}>{i18n.__('Save')}
            </button>
            {ExportAlertElement}
          </div>
        </div>
      </div>
    )
  }
}

export default CSSModules(Export, styles)
