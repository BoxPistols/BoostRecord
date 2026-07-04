import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './InfoTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import i18n from 'browser/lib/i18n'

const electron = require('electron')
const { shell } = electron
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

    this.setState({ config: { autoUpdateEnabled } })
  }

  handleLinkClick(e) {
    shell.openExternal(e.currentTarget.href)
    e.preventDefault()
  }

  handleAutoUpdateChange() {
    const autoUpdateEnabled = this.refs.autoUpdateEnabled.checked

    this.setState({ config: { autoUpdateEnabled } })
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
              <div styleName='appId'>The Boosters {appVersion}</div>
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
              href='https://github.com/BoxPistols/TheBoosters'
              onClick={e => this.handleLinkClick(e)}
            >
              GitHub (BoxPistols/TheBoosters)
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
            {i18n.__('Enable Auto Update')}
          </label>
        </div>
      </div>
    )
  }
}

InfoTab.propTypes = {}

export default CSSModules(InfoTab, styles)
