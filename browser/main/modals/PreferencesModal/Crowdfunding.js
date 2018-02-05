import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './Crowdfunding.styl'

const electron = require('electron')
const { shell } = electron

class Crowdfunding extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
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
        <p>Dear everyone,</p>
        <br />
        <p>Thank you for using Boostnote!</p>
        <p>Boostnote is used in about 200 different countries and regions by an awesome community of developers.</p>
        <br />
        <p>To continue supporting this growth, and to satisfy community expectations,</p>
        <p>we would like to invest more time and resources in this project.</p>
        <br />
        <p>If you like this project and see its potential, you can help by supporting us on OpenCollective!</p>
        <br />
        <p>Thanks,</p>
        <p>Boostnote maintainers</p>
        <br />
        <button styleName='cf-link'>
          <a href='https://opencollective.com/boostnoteio' onClick={(e) => this.handleLinkClick(e)}>Support via OpenCollective</a>
        </button>
      </div>
    )
  }
}

Crowdfunding.propTypes = {
}

export default CSSModules(Crowdfunding, styles)
