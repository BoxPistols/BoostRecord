import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ToggleStackDirectionButton.styl'
import i18n from 'browser/lib/i18n'

const ToggleStackDirectionButton = ({
  onClick, isStacking
}) => (
  <button styleName='control-splitPanelDirection' onClick={() => onClick(!isStacking)}>
    <img styleName='iconInfo' src={isStacking ? '../resources/icon/icon-panel-split-vertical.svg' : '../resources/icon/icon-panel-split-horizontal.svg'} />
    <span lang={i18n.locale} styleName='tooltip'>{
          isStacking ? i18n.__('Split Panels Horizontally') : i18n.__('Split Panels Vertically')

          }</span>
  </button>
)

ToggleStackDirectionButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  isStacking: PropTypes.bool.isRequired
}

export default CSSModules(ToggleStackDirectionButton, styles)
