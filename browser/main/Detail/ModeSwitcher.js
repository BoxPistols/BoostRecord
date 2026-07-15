import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ModeSwitcher.styl'
import i18n from 'browser/lib/i18n'

// Evenly-split 3-way view switcher for the note detail toolbar:
// Editor only / Split / Preview only. Replaces the old 2-state toggle + the
// separate preview (eye) button so the three views read as one control.
const MODES = [
  { key: 'EDITOR', icon: 'fa-pencil', label: 'Editor' },
  { key: 'SPLIT', icon: 'fa-columns', label: 'Split' },
  { key: 'PREVIEW', icon: 'fa-eye', label: 'Preview' }
]

const ModeSwitcher = ({ viewMode, onChange }) => (
  <div styleName='switcher' role='group' aria-label={i18n.__('Toggle Mode')}>
    {MODES.map(mode => (
      <button
        key={mode.key}
        styleName={viewMode === mode.key ? 'seg--active' : 'seg'}
        title={i18n.__(mode.label)}
        aria-label={i18n.__(mode.label)}
        aria-pressed={viewMode === mode.key}
        onMouseDown={() => onChange(mode.key)}
      >
        <i className={`fa ${mode.icon}`} aria-hidden='true' />
      </button>
    ))}
  </div>
)

ModeSwitcher.propTypes = {
  viewMode: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
}

export default CSSModules(ModeSwitcher, styles)
