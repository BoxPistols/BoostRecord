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
  // 修飾キー長押し中に 1..3 の連番バッジを出すか
  showJumpHint,
  isFolded,
  isHomeActive,
  handleAllNotesButtonClick,
  isStarredActive,
  handleStarredButtonClick,
  isBookmarkedActive,
  handleBookmarkedButtonClick,
  counterBookmarkedNote,
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
      data-jump-hint={1}
    >
      {showJumpHint && (
        <span styleName='menu-button-jump-hint' aria-hidden='true'>
          1
        </span>
      )}
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
      data-jump-hint={2}
    >
      {showJumpHint && (
        <span styleName='menu-button-jump-hint' aria-hidden='true'>
          2
        </span>
      )}
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
      styleName={
        isBookmarkedActive ? 'menu-button-bookmark--active' : 'menu-button'
      }
      onClick={handleBookmarkedButtonClick}
      onKeyDown={focusNoteListOnTab(handleBookmarkedButtonClick)}
      data-jump-hint={3}
    >
      {showJumpHint && (
        <span styleName='menu-button-jump-hint' aria-hidden='true'>
          3
        </span>
      )}
      <div styleName='iconWrap'>
        {/* スター等は SVG アセットだが、ブックマーク用のアセットが無いため
            同梱済みの Font Awesome を使う。色は menu-button 側で効く */}
        <i styleName='menu-button-icon-font' className='fa fa-bookmark' />
      </div>
      <span styleName='menu-button-label'>{i18n.__('Bookmark')}</span>
      <span styleName='counters'>{counterBookmarkedNote}</span>
    </button>

    <button
      styleName={isTrashedActive ? 'menu-button-trash--active' : 'menu-button'}
      onClick={handleTrashedButtonClick}
      onKeyDown={focusNoteListOnTab(handleTrashedButtonClick)}
      onContextMenu={handleFilterButtonContextMenu}
    >
      {/* ゴミ箱には連番を振らない。誤って Cmd+数字 を押した時に
          削除済みノートの一覧へ飛ぶ意味が薄いため */}
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
  isBookmarkedActive: PropTypes.bool,
  handleBookmarkedButtonClick: PropTypes.func,
  counterBookmarkedNote: PropTypes.number,
  isTrashedActive: PropTypes.bool.isRequired,
  handleStarredButtonClick: PropTypes.func.isRequired,
  handleTrashedButtonClick: PropTypes.func.isRequired
}

export default CSSModules(SideNavFilter, styles)
