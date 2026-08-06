/**
 * @fileoverview Micro component for showing storage.
 */
import PropTypes from 'prop-types'
import React from 'react'
import styles from './StorageItem.styl'
import CSSModules from 'browser/lib/CSSModules'
import _ from 'lodash'
import { SortableHandle } from 'react-sortable-hoc'
import ee from 'browser/main/lib/eventEmitter'
import i18n from 'browser/lib/i18n'

const DraggableIcon = SortableHandle(({ className }) => (
  <i className={`fa ${className}`} />
))

const FolderIcon = ({ className, color, isActive }) => {
  const iconStyle = isActive ? 'fa-folder-open-o' : 'fa-folder-o'
  return (
    <i className={`fa ${iconStyle} ${className}`} style={{ color: color }} />
  )
}

/**
 * @param {boolean} isActive
 * @param {object} tooltipRef,
 * @param {Function} handleButtonClick
 * @param {Function} handleMouseEnter
 * @param {Function} handleContextMenu
 * @param {string} folderName
 * @param {string} folderColor
 * @param {boolean} isFolded
 * @param {number} noteCount
 * @param {Function} handleDrop
 * @param {Function} handleDragEnter
 * @param {Function} handleDragOut
 * @return {React.Component}
 */
// 階層のインデント。深くなっても横幅が破綻しないよう頭打ちにする
const INDENT_STEP = 12
const MAX_INDENT_DEPTH = 5

const StorageItem = ({
  styles,
  // 修飾キー長押し中に出す 1..9 の連番。data 属性は常に出す（キー入力時に
  // まだ再描画が済んでいなくても引けるようにするため）
  jumpHint,
  isActive,
  tooltipRef,
  handleButtonClick,
  handleMouseEnter,
  handleContextMenu,
  folderName,
  folderColor,
  isFolded,
  noteCount,
  handleDrop,
  handleDragEnter,
  handleDragLeave,
  showJumpHint,
  // --- 多階層ツリー用 ---
  // 表示は葉の名前だけにする。フルパスを出すと ellipsis が**末尾**を落とすため、
  // 消えるのが唯一の識別情報（葉の名前）になる。階層はインデントで表す
  depth = 0,
  fullPath,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  // 並び替えドラッグはツリー表示時に嘘になるので、その時だけ隠す
  showReorderHandle = true
}) => {
  return (
    <button
      styleName={isActive ? 'folderList-item--active' : 'folderList-item'}
      // Stable class (styleName is hashed) so the note list can focus the
      // active folder on Shift+Tab.
      className={isActive ? 'SideNav-active-folder' : undefined}
      data-jump-hint={jumpHint || undefined}
      onClick={handleButtonClick}
      onKeyDown={e => {
        // Tab from a folder → select it and focus its note (file) list.
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault()
          if (handleButtonClick) handleButtonClick(e)
          ee.emit('list:focus')
        }
      }}
      onMouseEnter={handleMouseEnter}
      onContextMenu={handleContextMenu}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      // 幅が足りずに省略された時の逃げ道。折りたたみ状態に関係なく常に出す
      title={fullPath || folderName}
    >
      {showJumpHint && jumpHint && (
        <span styleName='folderList-item-jump-hint' aria-hidden='true'>
          {jumpHint}
        </span>
      )}
      {!isFolded && showReorderHandle && (
        <DraggableIcon className={styles['folderList-item-reorder']} />
      )}
      {!isFolded && depth > 0 && (
        <span
          styleName='folderList-item-indent'
          style={{ width: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP }}
          aria-hidden='true'
        />
      )}
      {!isFolded &&
        (hasChildren ? (
          // button の入れ子は不正なので span + role で作る
          <span
            styleName='folderList-item-expander'
            role='button'
            tabIndex={-1}
            aria-label={i18n.__(isExpanded ? 'Collapse' : 'Expand')}
            aria-expanded={isExpanded}
            onClick={e => {
              // 親行のクリック（フォルダ選択）まで巻き込まない
              e.stopPropagation()
              e.preventDefault()
              if (onToggleExpand) onToggleExpand()
            }}
          >
            <i
              className={`fa fa-caret-${isExpanded ? 'down' : 'right'}`}
              aria-hidden='true'
            />
          </span>
        ) : (
          // 子の無い行と桁を揃える（揃えないと同階層がガタつく）
          <span
            styleName='folderList-item-expander-spacer'
            aria-hidden='true'
          />
        ))}
      <span
        styleName={
          isFolded ? 'folderList-item-name--folded' : 'folderList-item-name'
        }
      >
        <FolderIcon
          styleName='folderList-item-icon'
          color={folderColor}
          isActive={isActive}
        />
        {isFolded
          ? _.truncate(folderName, { length: 1, omission: '' })
          : folderName}
      </span>
      {!isFolded && _.isNumber(noteCount) && (
        <span styleName='folderList-item-noteCount'>{noteCount}</span>
      )}
      {isFolded && (
        <span styleName='folderList-item-tooltip' ref={tooltipRef}>
          {fullPath || folderName}
        </span>
      )}
    </button>
  )
}

StorageItem.propTypes = {
  isActive: PropTypes.bool.isRequired,
  tooltipRef: PropTypes.object,
  handleButtonClick: PropTypes.func,
  handleMouseEnter: PropTypes.func,
  handleContextMenu: PropTypes.func,
  folderName: PropTypes.string.isRequired,
  folderColor: PropTypes.string,
  isFolded: PropTypes.bool.isRequired,
  handleDragEnter: PropTypes.func.isRequired,
  handleDragLeave: PropTypes.func.isRequired,
  noteCount: PropTypes.number,
  depth: PropTypes.number,
  fullPath: PropTypes.string,
  hasChildren: PropTypes.bool,
  isExpanded: PropTypes.bool,
  onToggleExpand: PropTypes.func,
  showReorderHandle: PropTypes.bool
}

export default CSSModules(StorageItem, styles)
