/**
 * @fileoverview Filter for all notes.
 */
import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SideNavFilter.styl'

/**
 * @param {boolean} isFolded
 * @param {boolean} isHomeActive
 * @param {Function} handleAllNotesButtonClick
 * @param {boolean} isStarredActive
 * @param {Function} handleStarredButtonClick
 * @return {React.Component}
 */
const SideNavFilter = ({
  isFolded, isHomeActive, handleAllNotesButtonClick,
  isStarredActive, handleStarredButtonClick, isTrashedActive, handleTrashedButtonClick, counterDelNote
}) => (
  <div styleName={isFolded ? 'menu--folded' : 'menu'}>
    <button styleName={isHomeActive ? 'menu-button--active' : 'menu-button'}
      onClick={handleAllNotesButtonClick}
    >
      <i className='fa fa-archive fa-fw' />
      <span styleName='menu-button-label'>All Notes</span>
    </button>
    <button styleName={isStarredActive ? 'menu-button-star--active' : 'menu-button'}
      onClick={handleStarredButtonClick}
    >
      <i className='fa fa-star fa-fw' />
      <span styleName='menu-button-label'>Starred</span>
    </button>
    <button styleName={isTrashedActive ? 'menu-button--active' : 'menu-button'}
      onClick={handleTrashedButtonClick}
    >
      <i className='fa fa-trash fa-fw' />
      <span styleName='menu-button-label'>Trash</span>
      <span styleName='counter-notes-trash'>{counterDelNote}</span>
    </button>
  </div>
)

SideNavFilter.propTypes = {
  isFolded: PropTypes.bool,
  isHomeActive: PropTypes.bool.isRequired,
  handleAllNotesButtonClick: PropTypes.func.isRequired,
  isStarredActive: PropTypes.bool.isRequired,
  isTrashedActive: PropTypes.bool.isRequired,
  handleStarredButtonClick: PropTypes.func.isRequired,
  handleTrashdButtonClick: PropTypes.func.isRequired
}

export default CSSModules(SideNavFilter, styles)
