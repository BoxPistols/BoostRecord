/**
 * @fileoverview Filter for all notes.
 */
import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SideNavFilter.styl'
import i18n from 'browser/lib/i18n'
import ee from 'browser/main/lib/eventEmitter'

// Tab でフィルタを選択してノート一覧へフォーカスを移す。フォルダボタン
// (components/StorageItem) と同じ挙動をサイドバー上部にも揃える。
// 逆方向 (Shift+Tab) は NoteList 側が受け持つ。
const focusNoteListOnTab = handleClick => e => {
  if (e.key !== 'Tab' || e.shiftKey) return
  e.preventDefault()
  if (handleClick) handleClick(e)
  ee.emit('list:focus')
}

/**
 * @param {boolean} isFolded
 * @param {boolean} isHomeActive
 * @param {Function} handleAllNotesButtonClick
 * @param {boolean} isStarredActive
 * @param {Function} handleStarredButtonClick
 * @return {React.Component}
 */
const SideNavFilter = ({
  isFolded,
  isHomeActive,
  handleAllNotesButtonClick,
  isStarredActive,
  handleStarredButtonClick,
  isTrashedActive,
  handleTrashedButtonClick,
  counterDelNote,
  counterTotalNote,
  counterStarredNote,
  handleFilterButtonContextMenu
}) => (
  <div styleName={isFolded ? 'menu--folded' : 'menu'}>
    <button
      styleName={isHomeActive ? 'menu-button--active' : 'menu-button'}
      onClick={handleAllNotesButtonClick}
      onKeyDown={focusNoteListOnTab(handleAllNotesButtonClick)}
    >
      <div styleName='iconWrap'>
        <img
          src={
            isHomeActive
              ? '../resources/icon/icon-all-active.svg'
              : '../resources/icon/icon-all.svg'
          }
        />
      </div>
      <span styleName='menu-button-label'>{i18n.__('All Notes')}</span>
      <span styleName='counters'>{counterTotalNote}</span>
    </button>

    <button
      styleName={isStarredActive ? 'menu-button-star--active' : 'menu-button'}
      onClick={handleStarredButtonClick}
      onKeyDown={focusNoteListOnTab(handleStarredButtonClick)}
    >
      <div styleName='iconWrap'>
        <img
          src={
            isStarredActive
              ? '../resources/icon/icon-star-active.svg'
              : '../resources/icon/icon-star-sidenav.svg'
          }
        />
      </div>
      <span styleName='menu-button-label'>{i18n.__('Starred')}</span>
      <span styleName='counters'>{counterStarredNote}</span>
    </button>

    <button
      styleName={isTrashedActive ? 'menu-button-trash--active' : 'menu-button'}
      onClick={handleTrashedButtonClick}
      onKeyDown={focusNoteListOnTab(handleTrashedButtonClick)}
      onContextMenu={handleFilterButtonContextMenu}
    >
      <div styleName='iconWrap'>
        <img
          src={
            isTrashedActive
              ? '../resources/icon/icon-trash-active.svg'
              : '../resources/icon/icon-trash-sidenav.svg'
          }
        />
      </div>
      <span styleName='menu-button-label'>{i18n.__('Trash')}</span>
      <span styleName='counters'>{counterDelNote}</span>
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
  handleTrashedButtonClick: PropTypes.func.isRequired
}

export default CSSModules(SideNavFilter, styles)
