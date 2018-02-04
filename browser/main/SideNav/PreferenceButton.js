import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './PreferenceButton.styl'

const PreferenceButton = ({
  onClick
}) => (
  <button styleName='top-menu-preference' onClick={(e) => onClick(e)}>
    <img styleName='iconTag' src='../resources/icon/icon-setting.svg' />
    <span styleName='tooltip'>Preferences</span>
  </button>
)

PreferenceButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(PreferenceButton, styles)
