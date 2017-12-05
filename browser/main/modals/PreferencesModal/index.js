import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import { connect } from 'react-redux'
import HotkeyTab from './HotkeyTab'
import UiTab from './UiTab'
import InfoTab from './InfoTab'
import Crowdfunding from './Crowdfunding'
import StoragesTab from './StoragesTab'
import ModalEscButton from 'browser/components/ModalEscButton'
import CSSModules from 'browser/lib/CSSModules'
import styles from './PreferencesModal.styl'
import RealtimeNotification from 'browser/components/RealtimeNotification'

class Preferences extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      currentTab: 'STORAGES',
      UIAlert: '',
      HotkeyAlert: ''
    }
  }

  componentDidMount () {
    this.refs.root.focus()
    const boundingBox = this.getContentBoundingBox()
    this.setState({ boundingBox })
  }

  switchTeam (teamId) {
    this.setState({currentTeamId: teamId})
  }

  handleNavButtonClick (tab) {
    return (e) => {
      this.setState({currentTab: tab})
    }
  }

  handleEscButtonClick () {
    this.props.close()
  }

  renderContent () {
    const { boundingBox } = this.state
    const { dispatch, config, data } = this.props

    switch (this.state.currentTab) {
      case 'INFO':
        return (
          <InfoTab
            dispatch={dispatch}
            config={config}
          />
        )
      case 'HOTKEY':
        return (
          <HotkeyTab
            dispatch={dispatch}
            config={config}
            haveToSave={msg => this.setState({HotkeyAlert: msg})}
          />
        )
      case 'UI':
        return (
          <UiTab
            dispatch={dispatch}
            config={config}
            haveToSave={msg => this.setState({UIAlert: msg})}
          />
        )
      case 'CROWDFUNDING':
        return (
          <Crowdfunding />
        )
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

  handleKeyDown (e) {
    if (e.keyCode === 27) {
      this.props.close()
    }
  }

  getContentBoundingBox () {
    const node = ReactDOM.findDOMNode(this.refs.content)
    return node.getBoundingClientRect()
  }
  
  haveToSaveNotif (tab) {
    return (
      <p styleName={`saving--${tab[tab.label].type}`}>{tab[tab.label].message}</p>
    )
  }

  render () {
    const content = this.renderContent()

    const tabs = [
      {target: 'STORAGES', label: 'Storages'},
      {target: 'HOTKEY', label: 'Hotkey', Hotkey: this.state.HotkeyAlert},
      {target: 'UI', label: 'UI', UI: this.state.UIAlert},
      {target: 'INFO', label: 'Community / Info'},
      {target: 'CROWDFUNDING', label: 'Crowdfunding'}
    ]

    const navButtons = tabs.map((tab) => {
      const isActive = this.state.currentTab === tab.target
      const isUiHotkeyTab = _.isObject(tab[tab.label]) && tab.label === tab[tab.label].tab
      return (
        <button styleName={isActive
            ? 'nav-button--active'
            : 'nav-button'
          }
          key={tab.target}
          onClick={(e) => this.handleNavButtonClick(tab.target)(e)}
        >
          <span styleName='nav-button-label'>
            {tab.label}
          </span>
          {isUiHotkeyTab ? this.haveToSaveNotif(tab) : null}
        </button>
      )
    })

    return (
      <div styleName='root'
        ref='root'
        tabIndex='-1'
        onKeyDown={(e) => this.handleKeyDown(e)}
      >
        <div styleName='top-bar'>
          <p>Your preferences for Boostnote</p>
        </div>
        <ModalEscButton handleEscButtonClick={(e) => this.handleEscButtonClick(e)} />
        <div styleName='nav'>
          {navButtons}
        </div>
        <div ref='content' styleName='content'>
          {content}
        </div>
        <RealtimeNotification />
      </div>
    )
  }
}

Preferences.propTypes = {
  dispatch: PropTypes.func
}

export default connect((x) => x)(CSSModules(Preferences, styles))
