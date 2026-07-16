import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './FontSizeControl.styl'
import i18n from 'browser/lib/i18n'

// Compact editor-header control for the app-wide text size (webFrame zoom).
// Mirrors the browser "A− / 100% / A+" zoom pattern; the middle % resets to
// 100%. Purely presentational — the parent wires onChange to ZoomManager.
const MIN = 0.75
const MAX = 1.5
const STEP = 0.05

// Snap to the nearest 5% so steps stay on 75/80/…/150 despite float drift.
const clamp = z => Math.round(Math.min(MAX, Math.max(MIN, z)) * 20) / 20

const FontSizeControl = ({ zoom, onChange }) => {
  const z = zoom || 1
  return (
    <div
      styleName='root'
      role='group'
      aria-label={i18n.__('App Font Size (Zoom)')}
    >
      <button
        styleName='btn'
        title={i18n.__('Decrease font size')}
        aria-label={i18n.__('Decrease font size')}
        disabled={z <= MIN}
        onClick={() => onChange(clamp(z - STEP))}
      >
        <span styleName='glyph-small' aria-hidden='true'>
          A
        </span>
      </button>
      <button
        styleName='value'
        title={i18n.__('Reset font size')}
        aria-label={i18n.__('Reset font size')}
        onClick={() => onChange(1)}
      >
        {Math.round(z * 100)}%
      </button>
      <button
        styleName='btn'
        title={i18n.__('Increase font size')}
        aria-label={i18n.__('Increase font size')}
        disabled={z >= MAX}
        onClick={() => onChange(clamp(z + STEP))}
      >
        <span styleName='glyph-large' aria-hidden='true'>
          A
        </span>
      </button>
    </div>
  )
}

FontSizeControl.propTypes = {
  zoom: PropTypes.number,
  onChange: PropTypes.func.isRequired
}

export default CSSModules(FontSizeControl, styles)
