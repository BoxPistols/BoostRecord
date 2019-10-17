import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ToggleDirectionButton.styl'
import i18n from 'browser/lib/i18n'

const ToggleDirectionButton = ({
  onClick, editorDirection
}) => (
  <div styleName='control-toggleModeButton'>
    <div styleName={editorDirection ? 'active' : undefined} onClick={() => onClick()}>
      <img src={!editorDirection ? '../resources/icon/icon-left-to-right.svg' : ''} />
    </div>
    <div styleName={!editorDirection ? 'active' : undefined} onClick={() => onClick()}>
      <img src={!editorDirection ? '' : '../resources/icon/icon-right-to-left.svg'} />
    </div>
    <span lang={i18n.locale} styleName='tooltip'>{i18n.__('Toggle Direction')}</span>
  </div>
)

ToggleDirectionButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  editorDirection: PropTypes.string.isRequired
}

export default CSSModules(ToggleDirectionButton, styles)
