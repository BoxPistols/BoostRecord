import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './TrashButton.styl'

const TrashButton = ({
  onClick
}) => (
  <button styleName='control-trashButton'
    onClick={(e) => onClick(e)}
  >
    <img styleName='iconInfo' src='../resources/icon/icon-trash.svg'/>
  </button>
)

TrashButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(TrashButton, styles)
