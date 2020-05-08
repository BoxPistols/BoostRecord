import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import store from 'browser/main/store'
import _ from 'lodash'
import i18n from 'browser/lib/i18n'

const electron = require('electron')
const ipc = electron.ipcRenderer

class PluginsTab extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      config: props.config
    }
  }

  componentDidMount() {
    this.handleSettingDone = () => {
      this.setState({
        pluginsAlert: {
          type: 'success',
          message: i18n.__('Successfully applied!')
        }
      })
    }
    this.handleSettingError = err => {
      if (
        this.state.config.wakatime.key === '' ||
        this.state.config.wakatime.key === null
      ) {
        this.setState({
          pluginsAlert: {
            type: 'success',
            message: i18n.__('Successfully applied!')
          }
        })
      } else {
        this.setState({
          pluginsAlert: {
            type: 'error',
            message:
              err.message != null ? err.message : i18n.__('An error occurred!')
          }
        })
      }
    }
    this.oldWakatimekey = this.state.config.wakatime
    ipc.addListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.addListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  componentWillUnmount() {
    ipc.removeListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.removeListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  handleSaveButtonClick(e) {
    const newConfig = {
      wakatime: this.state.config.wakatime
    }

    ConfigManager.set(newConfig)

    store.dispatch({
      type: 'SET_CONFIG',
      config: newConfig
    })
    this.clearMessage()
    this.props.haveToSave()
  }

  handleWakatimeKeyChange(e) {
    const { config } = this.state
    config.wakatime = { key: this.refs.key.value }
    this.setState({
      config
    })
    if (_.isEqual(this.oldWakatimekey, config.wakatime)) {
      this.props.haveToSave()
    } else {
      this.props.haveToSave({
        tab: 'Plugins',
        type: 'warning',
        message: i18n.__('Unsaved Changes!')
      })
    }
  }

  clearMessage() {
    _.debounce(() => {
      this.setState({
        pluginsAlert: null
      })
    }, 2000)()
  }

  render() {
    const pluginsAlert = this.state.pluginsAlert
    const pluginsAlertElement =
      pluginsAlert != null ? (
        <p className={`alert ${pluginsAlert.type}`}>{pluginsAlert.message}</p>
      ) : null
    const { config } = this.state

    return (
      <div styleName='root'>
        <div styleName='group'>
          <div styleName='group-header'>{i18n.__('Plugins')}</div>
          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Wakatime key')}</div>
            <div styleName='group-section-control'>
              <input
                styleName='group-section-control-input'
                onChange={e => this.handleWakatimeKeyChange(e)}
                ref='key'
                value={config.wakatime.key}
                type='text'
              />
            </div>
          </div>
          <div styleName='group-control'>
            <button
              styleName='group-control-rightButton'
              onClick={e => this.handleSaveButtonClick(e)}
            >
              {i18n.__('Save')}
            </button>
            {pluginsAlertElement}
          </div>
        </div>
      </div>
    )
  }
}

PluginsTab.propTypes = {
  dispatch: PropTypes.func,
  haveToSave: PropTypes.func
}

export default CSSModules(PluginsTab, styles)
