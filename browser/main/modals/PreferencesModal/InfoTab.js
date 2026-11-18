import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './InfoTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import i18n from 'browser/lib/i18n'

const electron = require('electron')
const { shell, ipcRenderer } = electron
const remote = require('@electron/remote')
const appVersion = remote.app.getVersion()

// 2026-07: severed from upstream — community/marketing links, the newsletter
// form, the AWS analytics opt-in, and the upstream brand name were removed
// (analytics itself is a no-op now, see AwsMobileAnalyticsConfig).
// The BoostIO copyright line stays: GPL v3 requires preserving legal notices
// even though the product name changed.
class InfoTab extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      config: this.props.config
    }
  }

  componentDidMount() {
    const { autoUpdateEnabled } = ConfigManager.get()

    // 更新の方法はメイン側（lib/app-updater.js）が持つ。メニューからも変えられるので、
    // ここでは開くたびに読み直す
    let update = { mode: 'confirm', supported: false }
    try {
      update = ipcRenderer.sendSync('update-get-state') || update
    } catch (e) {}
    this.setState({
      config: { autoUpdateEnabled },
      updateMode: update.mode,
      updateModeSupported: !!update.supported
    })
  }

  handleUpdateModeChange(e) {
    const updateMode = e.target.value
    this.setState({ updateMode })
    ipcRenderer.send('update-set-mode', updateMode)
  }

  handleLinkClick(e) {
    shell.openExternal(e.currentTarget.href)
    e.preventDefault()
  }

  handleAutoUpdateChange() {
    const autoUpdateEnabled = this.refs.autoUpdateEnabled.checked

    this.setState({
      config: Object.assign({}, this.state.config, { autoUpdateEnabled })
    })
    ConfigManager.set({ autoUpdateEnabled })
  }

  render() {
    return (
      <div styleName='root'>
        <div styleName='group-header--sub'>{i18n.__('About')}</div>

        <div styleName='top'>
          <div styleName='icon-space'>
            <img
              styleName='icon'
              src='../resources/app.png'
              width='92'
              height='92'
            />
            <div styleName='icon-right'>
              <div styleName='appId'>BoostRecord {appVersion}</div>
              <div styleName='description'>
                {i18n.__(
                  'An open source note-taking app made for programmers just like you.'
                )}
              </div>
            </div>
          </div>
        </div>

        <ul styleName='list'>
          <li>
            <a
              href='https://github.com/BoxPistols/BoostRecord'
              onClick={e => this.handleLinkClick(e)}
            >
              GitHub (BoxPistols/BoostRecord)
            </a>
          </li>
          <li styleName='cc'>
            {i18n.__('License: GPL v3')} — Copyright (C) 2017 - 2020 BoostIO /
            2025 - 2026 BoxPistols
          </li>
        </ul>

        <div>
          <label>
            <input
              type='checkbox'
              ref='autoUpdateEnabled'
              onChange={() => this.handleAutoUpdateChange()}
              checked={this.state.config.autoUpdateEnabled}
            />
            {i18n.__('Check for updates automatically')}
          </label>
        </div>
        {this.state.updateModeSupported ? (
          <div>
            <label>
              {i18n.__('When an update is found')}{' '}
              <select
                value={this.state.updateMode}
                onChange={e => this.handleUpdateModeChange(e)}
              >
                <option value='confirm'>
                  {i18n.__('Ask before updating')}
                </option>
                <option value='auto'>{i18n.__('Update automatically')}</option>
              </select>
            </label>
            <p styleName='policy-confirm'>
              {i18n.__(
                'Automatic updates wait until you have been away for 5 minutes and every edit is saved, then reopen BoostRecord.'
              )}
            </p>
          </div>
        ) : null}
      </div>
    )
  }
}

InfoTab.propTypes = {}

export default CSSModules(InfoTab, styles)
