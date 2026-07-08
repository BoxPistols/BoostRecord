import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
// Reuse the Preferences button styling so it matches the adjacent icons.
import styles from './PreferenceButton.styl'
import i18n from 'browser/lib/i18n'

const ImageManagerButton = ({ onClick }) => (
  <button styleName='top-menu-preference' onClick={e => onClick(e)}>
    <i className='fa fa-picture-o' style={{ fontSize: '17px' }} />
    <span styleName='tooltip'>{i18n.__('Image Manager')}</span>
  </button>
)

ImageManagerButton.propTypes = {
  onClick: PropTypes.func.isRequired
}

export default CSSModules(ImageManagerButton, styles)
