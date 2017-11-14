import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './InfoButton.styl'

const InfoButton = ({
  onClick
}) => (
  <button styleName='control-infoButton'
    onClick={onClick}
  >
    <i className='fa fa-info-circle infoButton' styleName='info-button' />
  </button>
)

InfoButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(InfoButton, styles)
