import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './Crowdfunding.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import store from 'browser/main/store'

const electron = require('electron')
const { shell, remote } = electron

class Crowdfunding extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      config: this.props.config
    }
  }

  handleLinkClick (e) {
    shell.openExternal(e.currentTarget.href)
    e.preventDefault()
  }

  render () {
    return (
      <div styleName='root'>
        <div styleName='header'>Crowdfunding</div>
        <p>Dear all,</p>
        <br />
        <p>Thanks for your using!</p>
        <p>Boostnote is used in about 200 countries and regions, it is a awesome developer community.</p>
        <br />
        <p>To continue supporting this growth, and to satisfy community expectations,</p>
        <p>we would like to invest more time in this project.</p>
        <br />
        <p>If you like this project and see its potential, you can help!</p>
        <br />
        <p>Thanks,</p>
        <p>Boostnote maintainers.</p>
        <br />
        <button styleName="cf-link">
          <a href='https://salt.bountysource.com/teams/boostnote'
                onClick={(e) => this.handleLinkClick(e)}
          >Support via Bountysource</a>
        </button>
      </div>
    )
  }
}

Crowdfunding.propTypes = {
}

export default CSSModules(Crowdfunding, styles)