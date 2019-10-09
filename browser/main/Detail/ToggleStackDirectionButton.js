import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ToggleStackDirectionButton.styl'
import i18n from 'browser/lib/i18n'

const ToggleStackDirectionButton = ({
  onClick, isStacking
}) => {
  const imgSrc = isStacking ? '../resources/icon/icon-panel-split-vertical.svg' : '../resources/icon/icon-panel-split-horizontal.svg'
  const text = isStacking ? i18n.__('Split Panels Horizontally') : i18n.__('Split Panels Vertically')
  return (
    <button styleName='control-splitPanelDirection' onClick={() => onClick(!isStacking)}>
      <img styleName='iconInfo' src={imgSrc} />
      <span lang={i18n.locale} styleName='tooltip'>{text}</span>
    </button>
  )
}

ToggleStackDirectionButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  isStacking: PropTypes.bool.isRequired
}

export default CSSModules(ToggleStackDirectionButton, styles)
