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
import { subscribe, getJumpNumber } from 'browser/lib/metaKeyHold'

// 左ナビの並び。番号ショートカット（修飾キー + 1..8）はこの順で引く
const TAB_ORDER = [
  'STORAGES',
  'HOTKEY',
  'UI',
  'INFO',
  'EXPORT',
  'SNIPPET',
  'AI',
  'IMAGES'
]

class Preferences extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTab: 'STORAGES',
      UIAlert: '',
      HotkeyAlert: '',
      ExportAlert: '',
      // 修飾キー長押し中だけ左ナビに 1..8 の番号を出す（サイドバーと同じ作法）
      showJumpHints: false
    }
  }

  componentDidMount() {
    this.refs.root.focus()
    const boundingBox = this.getContentBoundingBox()
    this.setState({ boundingBox })
    this.unsubscribeMetaKey = subscribe(held =>
      this.setState({ showJumpHints: held })
    )
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

  handleKeyDown(e) {
    if (e.keyCode === 27) {
      this.props.close()
      return
    }
    // 修飾キー + 1..8 で左ナビの N 番目のタブへ。入力欄の中からも効く
    const jumpTo = getJumpNumber(e)
    if (jumpTo === null) return
    const tab = TAB_ORDER[jumpTo - 1]
    if (!tab) return
    e.preventDefault()
    this.setState({ currentTab: tab, showJumpHints: false })
  }

  getContentBoundingBox() {
    return this.refs.content.getBoundingClientRect()
  }

  haveToSaveNotif(type, message) {
    return <p styleName={`saving--${type}`}>{message}</p>
  }

  render() {
    const content = this.renderContent()

    const tabs = [
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

    const navButtons = tabs.map((tab, i) => {
      const isActive = this.state.currentTab === tab.target
      const isUiHotkeyTab =
        _.isObject(tab[tab.label]) && tab.label === tab[tab.label].tab
      const jumpHint = i + 1
      return (
        <button
          styleName={isActive ? 'nav-button--active' : 'nav-button'}
          key={tab.target}
          onClick={e => this.handleNavButtonClick(tab.target)(e)}
          data-jump-hint={jumpHint}
        >
          {this.state.showJumpHints && (
            <span styleName='nav-button-jump-hint' aria-hidden='true'>
              {jumpHint}
            </span>
          )}
          <span>{tab.label}</span>
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
          <p>{i18n.__('Your preferences for BoostRecord')}</p>
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
