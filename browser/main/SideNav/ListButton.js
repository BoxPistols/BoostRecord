import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SwitchButton.styl'

const ListButton = ({
  onClick, isTagActive
}) => (
  <button styleName={isTagActive ? 'non-active-button' : 'active-button'} onClick={onClick}>
    <img src={isTagActive
        ? '../resources/icon/icon-list.svg'
        : '../resources/icon/icon-list-active.svg'
    }
    />
    <span styleName='tooltip'>Notes</span>
  </button>
)

ListButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  isTagActive: PropTypes.bool.isRequired
}

export default CSSModules(ListButton, styles)
