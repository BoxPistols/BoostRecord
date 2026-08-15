import PropTypes from 'prop-types'
import React from 'react'
import { connect } from 'react-redux'
import HotkeyTab from './HotkeyTab'
import UiTab from './UiTab'
import InfoTab from './InfoTab'
// Removed tabs (2026-07): Crowdfunding (obsolete upstream campaign),
// Blog (WordPress-only publisher; a future Zenn integration will be new code),
// Plugins (only hosted the wakatime tracker, which was dropped).
import StoragesTab from './StoragesTab'
import ExportTab from './ExportTab'
import SnippetTab from './SnippetTab'
import AITab from './AITab'
import ImagesTab from './ImagesTab'
import ModalEscButton from 'browser/components/ModalEscButton'
import CSSModules from 'browser/lib/CSSModules'
import styles from './PreferencesModal.styl'
import _ from 'lodash'
import i18n from 'browser/lib/i18n'
import {
  subscribe as subscribeMetaKey,
  getJumpNumber,
  MAX_JUMP_TARGETS
} from 'browser/lib/metaKeyHold'

class Preferences extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTab: 'STORAGES',
      // 修飾キー長押し中だけタブへ 1..9 のバッジを出す（本体のスニペット
      // タブと同じ操作にする）。押していない間は出さない
      showJumpHints: false,
      UIAlert: '',
      HotkeyAlert: '',
      ExportAlert: ''
    }
  }

  componentDidMount() {
    this.refs.root.focus()
    const boundingBox = this.getContentBoundingBox()
    this.setState({ boundingBox })
    this.unsubscribeMetaKey = subscribeMetaKey(held => {
      if (held !== this.state.showJumpHints) {
        this.setState({ showJumpHints: held })
      }
    })
  }

  componentWillUnmount() {
    if (this.unsubscribeMetaKey) this.unsubscribeMetaKey()
  }

  switchTeam(teamId) {
    this.setState({ currentTeamId: teamId })
  }

  handleNavButtonClick(tab) {
    return e => {
      this.setState({ currentTab: tab })
    }
  }

  handleEscButtonClick() {
    this.props.close()
  }

  renderContent() {
    const { boundingBox } = this.state
    const { dispatch, config, data } = this.props

    switch (this.state.currentTab) {
      case 'INFO':
        return <InfoTab dispatch={dispatch} config={config} />
      case 'HOTKEY':
        return (
          <HotkeyTab
            dispatch={dispatch}
            config={config}
            haveToSave={alert => this.setState({ HotkeyAlert: alert })}
          />
        )
      case 'UI':
        return (
          <UiTab
            dispatch={dispatch}
            config={config}
            haveToSave={alert => this.setState({ UIAlert: alert })}
          />
        )
      case 'EXPORT':
        return (
          <ExportTab
            dispatch={dispatch}
            config={config}
            data={data}
            haveToSave={alert => this.setState({ ExportAlert: alert })}
          />
        )
      case 'SNIPPET':
        return <SnippetTab dispatch={dispatch} config={config} data={data} />
      case 'AI':
        return <AITab dispatch={dispatch} config={config} />
      case 'IMAGES':
        return <ImagesTab data={data} />
      case 'STORAGES':
      default:
        return (
          <StoragesTab
            dispatch={dispatch}
            data={data}
            boundingBox={boundingBox}
          />
        )
    }
  }

  /**
   * タブ定義。**描画とキー操作の両方から参照する**ので1か所に置く。
   * 2か所に書くと、タブを足した時に片方だけ更新して番号がずれる
   */
  tabs() {
    return [
      { target: 'STORAGES', label: i18n.__('Storage') },
      {
        target: 'HOTKEY',
        label: i18n.__('Hotkeys'),
        Hotkey: this.state.HotkeyAlert
      },
      { target: 'UI', label: i18n.__('Interface'), UI: this.state.UIAlert },
      { target: 'INFO', label: i18n.__('About') },
      {
        target: 'EXPORT',
        label: i18n.__('Export'),
        Export: this.state.ExportAlert
      },
      { target: 'SNIPPET', label: i18n.__('Snippets') },
      { target: 'AI', label: i18n.__('AI') },
      { target: 'IMAGES', label: i18n.__('Images') }
    ]
  }

  handleKeyDown(e) {
    if (e.keyCode === 27) {
      this.props.close()
      return
    }
    // 修飾キー + 1..9 で N 番目のタブへ。本体のスニペットタブと同じ規則
    // （keyCode で見るので US 配列以外でも同じ位置のキーで動く）
    const jumpTo = getJumpNumber(e)
    if (jumpTo !== null) {
      const tab = this.tabs()[jumpTo - 1]
      if (!tab) return
      e.preventDefault()
      this.setState({ currentTab: tab.target })
    }
  }

  getContentBoundingBox() {
    return this.refs.content.getBoundingClientRect()
  }

  haveToSaveNotif(type, message) {
    return <p styleName={`saving--${type}`}>{message}</p>
  }

  render() {
    const content = this.renderContent()

    const tabs = this.tabs()

    const navButtons = tabs.map((tab, index) => {
      const isActive = this.state.currentTab === tab.target
      const isUiHotkeyTab =
        _.isObject(tab[tab.label]) && tab.label === tab[tab.label].tab
      return (
        <button
          styleName={isActive ? 'nav-button--active' : 'nav-button'}
          key={tab.target}
          onClick={e => this.handleNavButtonClick(tab.target)(e)}
        >
          <span>{tab.label}</span>
          {this.state.showJumpHints && index < MAX_JUMP_TARGETS && (
            <span styleName='nav-button-hint'>{index + 1}</span>
          )}
          {isUiHotkeyTab
            ? this.haveToSaveNotif(tab[tab.label].type, tab[tab.label].message)
            : null}
        </button>
      )
    })

    return (
      <div
        styleName='root'
        ref='root'
        tabIndex='-1'
        onKeyDown={e => this.handleKeyDown(e)}
      >
        <div styleName='top-bar'>
          <p>{i18n.__('Your preferences for The Boosters')}</p>
        </div>
        <ModalEscButton
          handleEscButtonClick={e => this.handleEscButtonClick(e)}
        />
        <div styleName='nav'>{navButtons}</div>
        <div ref='content' styleName='content'>
          {content}
        </div>
      </div>
    )
  }
}

Preferences.propTypes = {
  dispatch: PropTypes.func
}

export default connect(x => x)(CSSModules(Preferences, styles))
