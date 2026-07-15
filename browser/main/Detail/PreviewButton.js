import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './PreviewButton.styl'
import i18n from 'browser/lib/i18n'

// Toolbar toggle that hides the Markdown editor and shows only the rendered
// preview (a discoverable, one-click alternative to the editor-mode + lock
// dance). `active` reflects the current preview-only state.
const PreviewButton = ({ onClick, active }) => (
  <button
    styleName='control-previewButton'
    data-active={active ? 'true' : 'false'}
    title={i18n.__('Preview')}
    onMouseDown={e => onClick(e)}
  >
    <i className={active ? 'fa fa-eye' : 'fa fa-eye-slash'} />
    <span lang={i18n.locale} styleName='tooltip'>
      {i18n.__('Preview')}
    </span>
  </button>
)

PreviewButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  active: PropTypes.bool
}

export default CSSModules(PreviewButton, styles)
