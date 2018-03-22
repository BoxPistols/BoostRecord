import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './FullscreenButton.styl'
import i18n from 'browser/lib/i18n'

const FullscreenButton = ({
 onClick
}) => (
  <button styleName='control-fullScreenButton' title={i18n.__('Fullscreen')} onMouseDown={(e) => onClick(e)}>
    <img styleName='iconInfo' src='../resources/icon/icon-full.svg' />
    <span styleName='tooltip'>{i18n.__('Fullscreen')}</span>
  </button>
)

FullscreenButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(FullscreenButton, styles)
