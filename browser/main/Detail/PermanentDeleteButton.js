import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './TrashButton.styl'

const PermanentDeleteButton = ({
  onClick
}) => (
  <button styleName='control-trashButton--in-trash'
    onClick={(e) => onClick(e)}
  >
    <i className='fa fa-trash trashButton' styleName='info-button' />
  </button>
)

PermanentDeleteButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(PermanentDeleteButton, styles)
