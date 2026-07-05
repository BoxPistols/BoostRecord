import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import _ from 'lodash'
import i18n from 'browser/lib/i18n'

const electron = require('electron')
const ipc = electron.ipcRenderer

class ExportTab extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      config: props.config
    }
  }

  clearMessage() {
    _.debounce(() => {
      this.setState({
        ExportAlert: null
      })
    }, 2000)()
  }

  componentDidMount() {
    this.handleSettingDone = () => {
      this.setState({
        ExportAlert: {
          type: 'success',
          message: i18n.__('Successfully applied!')
        }
      })
    }
    this.handleSettingError = err => {
      this.setState({
        ExportAlert: {
          type: 'error',
          message:
            err.message != null ? err.message : i18n.__('An error occurred!')
        }
      })
    }

    this.oldExport = this.state.config.export

    ipc.addListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.addListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  componentWillUnmount() {
    ipc.removeListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.removeListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  handleSaveButtonClick(e) {
    const newConfig = {
      export: this.state.config.export
    }

    ConfigManager.set(newConfig)

    store.dispatch({
      type: 'SET_UI',
      config: newConfig
    })

    this.clearMessage()
    this.props.haveToSave()
  }

  handleExportChange(e) {
    const { config } = this.state

    config.export = {
      metadata: this.refs.metadata.value,
      variable: !_.isNil(this.refs.variable)
        ? this.refs.variable.value
        : config.export.variable,
      prefixAttachmentFolder: this.refs.prefixAttachmentFolder.checked
    }

    this.setState({
      config
    })

    if (_.isEqual(this.oldExport, config.export)) {
      this.props.haveToSave()
    } else {
      this.props.haveToSave({
        tab: 'Export',
        type: 'warning',
        message: i18n.__('Unsaved Changes!')
      })
    }
  }

  render() {
    const { config, ExportAlert } = this.state

    const ExportAlertElement =
      ExportAlert != null ? (
        <p className={`alert ${ExportAlert.type}`}>{ExportAlert.message}</p>
      ) : null

    return (
      <div styleName='root'>
        <div styleName='group'>
          <div styleName='group-header'>{i18n.__('Export')}</div>

          <div styleName='group-hint'>
            <p>{i18n.__('Where export happens:')}</p>
            <ul>
              <li>{i18n.__('Menu: File > Export as')}</li>
              <li>
                {i18n.__(
                  'Note info panel (i) > export buttons (.md / .txt / .html / .pdf)'
                )}
              </li>
              <li>{i18n.__('Right-click a note in the note list')}</li>
            </ul>

            <p>
              {i18n.__(
                'Metadata — include note info (title, tags, dates) at the top of the exported file:'
              )}
            </p>
            <ul>
              <li>{i18n.__("Don't export — body text only")}</li>
              <li>
                {i18n.__('Merge with the header — each field is written as-is')}
              </li>
              <li>
                {i18n.__(
                  'Merge with a variable — everything is nested under the variable name below'
                )}
              </li>
            </ul>
            <pre styleName='group-hint-code'>
              {'# Merge with the header\n' +
                '---\n' +
                'title: 会議メモ\n' +
                'tags:\n' +
                '  - work\n' +
                'createdAt: 2026-07-06T10:00:00.000Z\n' +
                '---\n' +
                '(本文)\n' +
                '\n' +
                '# Merge with a variable（変数名: note）\n' +
                '---\n' +
                'note:\n' +
                '  title: 会議メモ\n' +
                '  tags:\n' +
                '    - work\n' +
                '---\n' +
                '(本文)'}
            </pre>

            <p>{i18n.__('Prefix attachment folder:')}</p>
            <ul>
              <li>
                {i18n.__(
                  'ON — attachments are exported to a per-note folder: "Note title - attachments"'
                )}
              </li>
              <li>
                {i18n.__(
                  'OFF — all notes share one "attachments" folder (files may overwrite each other)'
                )}
              </li>
            </ul>
          </div>

          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Metadata')}</div>
            <div styleName='group-section-control'>
              <select
                value={config.export.metadata}
                onChange={e => this.handleExportChange(e)}
                ref='metadata'
              >
                <option value='DONT_EXPORT'>{i18n.__(`Don't export`)}</option>
                <option value='MERGE_HEADER'>
                  {i18n.__('Merge with the header')}
                </option>
                <option value='MERGE_VARIABLE'>
                  {i18n.__('Merge with a variable')}
                </option>
              </select>
            </div>
          </div>

          {config.export.metadata === 'MERGE_VARIABLE' && (
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Variable Name')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  onChange={e => this.handleExportChange(e)}
                  ref='variable'
                  value={config.export.variable}
                  type='text'
                />
              </div>
            </div>
          )}

          <div styleName='group-checkBoxSection'>
            <label>
              <input
                onChange={e => this.handleExportChange(e)}
                checked={config.export.prefixAttachmentFolder}
                ref='prefixAttachmentFolder'
                type='checkbox'
              />
              &nbsp;
              {i18n.__('Prefix attachment folder')}
            </label>
          </div>

          <div styleName='group-control'>
            <button
              styleName='group-control-rightButton'
              onClick={e => this.handleSaveButtonClick(e)}
            >
              {i18n.__('Save')}
            </button>
            {ExportAlertElement}
          </div>
        </div>
      </div>
    )
  }
}

ExportTab.propTypes = {
  dispatch: PropTypes.func,
  haveToSave: PropTypes.func
}

export default CSSModules(ExportTab, styles)
