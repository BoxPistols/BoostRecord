import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './TrashButton.styl'

const PermanentDeleteButton = ({
  onClick
}) => (
  <button styleName='control-trashButton--in-trash'
    onClick={(e) => onClick(e)}
  >
    <img styleName='iconInfo' src='../resources/icon/icon-trash.svg' />
    <span styleName='tooltip'>Permanent Delete</span>
  </button>
)

PermanentDeleteButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(PermanentDeleteButton, styles)
