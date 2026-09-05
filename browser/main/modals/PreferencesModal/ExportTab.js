import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import _ from 'lodash'
import i18n from 'browser/lib/i18n'
import eventEmitter from 'browser/main/lib/eventEmitter'

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

  handleOpenExampleNote() {
    // Creates/opens the all-features example note (handled by NewNoteButton).
    // Moved here from a File-menu hotkey so it is an explicit, procedural action.
    eventEmitter.emit('top:example-note')
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
            {/* 文章だけでは伝わらないので、流れ・出力の差・フォルダ構造を
                図にする。文言は図の補足に留める */}
            <p>
              {i18n.__(
                'Exporting turns a note into a file outside this app. This tab sets the defaults for those files.'
              )}
            </p>

            <div styleName='export-flow'>
              <div styleName='export-flow-col'>
                <div styleName='export-flow-title'>
                  {i18n.__('Where export happens:')}
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-bars' />
                  <span>File &gt; Export as</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-info-circle' />
                  <span>{i18n.__('Note info panel (i)')}</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-mouse-pointer' />
                  <span>{i18n.__('Right-click a note')}</span>
                </div>
              </div>
              <div styleName='export-flow-arrow'>
                <i className='fa fa-long-arrow-right' />
              </div>
              <div styleName='export-flow-col'>
                <div styleName='export-flow-title'>{i18n.__('File')}</div>
                <div styleName='export-tile'>
                  <i className='fa fa-file-text-o' />
                  <span>.md / .txt</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-file-code-o' />
                  <span>.html</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-file-pdf-o' />
                  <span>.pdf</span>
                </div>
              </div>
              <div styleName='export-flow-arrow'>
                <i className='fa fa-long-arrow-right' />
              </div>
              <div styleName='export-flow-col'>
                <div styleName='export-flow-title'>
                  {i18n.__('Destination')}
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-user-o' />
                  <span>{i18n.__('Someone without this app')}</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-git' />
                  <span>{i18n.__('Obsidian / Git repository')}</span>
                </div>
                <div styleName='export-tile'>
                  <i className='fa fa-folder-o' />
                  <span>{i18n.__('Plain file on disk')}</span>
                </div>
              </div>
            </div>

            <div styleName='export-flow-title'>
              <i className='fa fa-tag' /> {i18n.__('Metadata')}
              {' — '}
              {i18n.__('what goes at the top of the exported file')}
            </div>
            <div styleName='export-compare'>
              <div styleName='export-compare-item'>
                <div styleName='export-compare-label'>
                  {i18n.__("Don't export")}
                </div>
                <pre styleName='export-compare-body'>{'(本文)'}</pre>
              </div>
              <div styleName='export-compare-item'>
                <div styleName='export-compare-label'>
                  {i18n.__('Merge with the header')}
                </div>
                <pre styleName='export-compare-meta'>
                  {
                    '---\ntitle: 会議メモ\ntags:\n  - work\ncreatedAt: 2026-07-06\n---'
                  }
                </pre>
                <pre styleName='export-compare-body'>{'(本文)'}</pre>
              </div>
              <div styleName='export-compare-item'>
                <div styleName='export-compare-label'>
                  {i18n.__('Merge with a variable')}
                  <span styleName='export-compare-sub'>note</span>
                </div>
                <pre styleName='export-compare-meta'>
                  {'---\nnote:\n  title: 会議メモ\n  tags:\n    - work\n---'}
                </pre>
                <pre styleName='export-compare-body'>{'(本文)'}</pre>
              </div>
            </div>

            <div styleName='export-flow-title'>
              <i className='fa fa-paperclip' />{' '}
              {i18n.__('Prefix attachment folder')}
              {' — '}
              {i18n.__('where attachments land')}
            </div>
            <div styleName='export-compare'>
              <div styleName='export-compare-item'>
                <div styleName='export-compare-label'>
                  <i className='fa fa-check-square-o' /> ON
                </div>
                <div styleName='export-tree'>
                  <div>
                    <i className='fa fa-folder-o' /> 会議メモ - attachments/
                  </div>
                  <div styleName='export-tree-leaf'>
                    <i className='fa fa-file-image-o' /> image.png
                  </div>
                  <div>
                    <i className='fa fa-folder-o' /> 議事録 - attachments/
                  </div>
                  <div styleName='export-tree-leaf'>
                    <i className='fa fa-file-image-o' /> image.png
                  </div>
                </div>
                <p styleName='export-note'>
                  {i18n.__(
                    'One folder per note. Same file names never collide.'
                  )}
                </p>
              </div>
              <div styleName='export-compare-item'>
                <div styleName='export-compare-label'>
                  <i className='fa fa-square-o' /> OFF
                </div>
                <div styleName='export-tree'>
                  <div>
                    <i className='fa fa-folder-o' /> attachments/
                  </div>
                  <div styleName='export-tree-leaf'>
                    <i className='fa fa-file-image-o' /> image.png{' '}
                    <i className='fa fa-exclamation-triangle' />
                  </div>
                </div>
                <p styleName='export-note'>
                  {i18n.__(
                    'All notes share one folder. Files with the same name overwrite each other.'
                  )}
                </p>
              </div>
            </div>

            <div styleName='export-flow-title'>
              <i className='fa fa-plug' /> {i18n.__('Format compatibility')}
            </div>
            <div styleName='export-compat'>
              <div styleName='export-compat-row'>
                <span styleName='export-compat-key'>YAML front matter</span>
                <span styleName='export-chip'>Jekyll</span>
                <span styleName='export-chip'>Hugo</span>
                <span styleName='export-chip'>Next.js MDX</span>
                <span styleName='export-chip'>Obsidian</span>
              </div>
              <div styleName='export-compat-row'>
                <span styleName='export-compat-key'>Mermaid</span>
                <span styleName='export-chip'>
                  <i className='fa fa-github' /> GitHub
                </span>
                <span styleName='export-chip'>
                  <i className='fa fa-gitlab' /> GitLab
                </span>
                <span styleName='export-chip'>Notion</span>
                <span styleName='export-chip'>Obsidian</span>
              </div>
              <div styleName='export-compat-row'>
                <span styleName='export-compat-key'>{i18n.__('AI docs')}</span>
                <span styleName='export-chip'>CLAUDE.md</span>
                <span styleName='export-chip'>Skills.md</span>
                <span styleName='export-note'>
                  {i18n.__(
                    'Export .md with "Merge with the header". Front matter, Mermaid and code blocks are kept as-is.'
                  )}
                </span>
              </div>
            </div>

            <p style={{ marginTop: '14px' }}>
              {i18n.__(
                'Create a full example note (YAML front matter + Mermaid + code blocks) to see all of the above in action:'
              )}
            </p>
            <button
              styleName='group-control-rightButton'
              style={{ marginLeft: 0 }}
              onClick={() => this.handleOpenExampleNote()}
            >
              {i18n.__('Open Example Note')}
            </button>
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
