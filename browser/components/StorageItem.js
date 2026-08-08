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

/**
 * フォルダ名のその場編集。ダブルクリック（または右クリック→名称変更）で
 * 行の名前部分だけを入力欄に置き換える。モーダルを出さない。
 *
 * IME を壊さないこと（このリポジトリの定石）:
 * - 変換確定の Enter で確定しない（isComposing / keyCode 229 の両方を見る）
 * - ↑↓ は奪わない（候補ウィンドウの操作キー）
 * 確定は Enter / blur、取り消しは Esc。二重確定を防ぐため done フラグを持つ
 * （Enter 確定 → 親が state を消す → unmount 前後に blur が来ても無視する）
 */
class InlineRename extends React.Component {
  constructor(props) {
    super(props)
    this.done = false
    this.composing = false
    this.inputRef = React.createRef()
  }

  componentDidMount() {
    const el = this.inputRef.current
    if (!el) return
    el.focus()
    el.select()
    // クリック起点の遅延 focus（サイドバーのルートへ移す仕掛け等）が
    // 後から着弾して奪うことがある。1拍置いてもう一度取り直す
    // （このタイマーは奪う側のタイマーより後に積まれるので必ず勝つ）
    setTimeout(() => {
      const later = this.inputRef.current
      if (later && document.activeElement !== later && !this.done) {
        later.focus()
        later.select()
      }
    }, 0)
  }

  confirm() {
    if (this.done) return
    this.done = true
    const el = this.inputRef.current
    this.props.onConfirm(el ? el.value : '')
  }

  cancel() {
    if (this.done) return
    this.done = true
    this.props.onCancel()
  }

  handleKeyDown(e) {
    // 行やグローバルのキー処理（Tab 移動・ホットキー）に漏らさない
    e.stopPropagation()
    const composing =
      this.composing ||
      (e.nativeEvent && e.nativeEvent.isComposing) ||
      e.keyCode === 229
    if (e.key === 'Escape') {
      // 変換中の Esc は「変換の取り消し」であって編集の破棄ではない。
      // ガードしないと、候補ウィンドウを消すつもりの Esc で
      // 入力済みテキストごと編集が閉じる
      if (composing) return
      e.preventDefault()
      this.cancel()
      return
    }
    if (e.key === 'Enter') {
      if (composing) return
      e.preventDefault()
      this.confirm()
    }
  }

  render() {
    return (
      <input
        className={this.props.className}
        ref={this.inputRef}
        type='text'
        defaultValue={this.props.defaultValue}
        aria-label={i18n.__('Rename Folder')}
        onCompositionStart={() => {
          this.composing = true
        }}
        onCompositionEnd={() => {
          this.composing = false
        }}
        onKeyDown={e => this.handleKeyDown(e)}
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        onBlur={() => this.confirm()}
      />
    )
  }
}

InlineRename.propTypes = {
  className: PropTypes.string,
  defaultValue: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}

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
  showReorderHandle = true,
  // --- その場編集（ダブルクリック改名）---
  isEditing = false,
  // 編集の初期値。表示名（folderName）は名前なしフォルダで
  // 'Untitled folder' 等のプレースホルダになるため、それを初期値にすると
  // 無編集の blur 確定で UI 文字列が実名として保存されてしまう
  renameDefaultValue,
  onRenameConfirm,
  onRenameCancel
}) => {
  // 編集中は button を div に替える。button の中の input は不正な入れ子で、
  // フォーカスとキー入力が奪い合いになる
  if (isEditing) {
    return (
      <div
        styleName={isActive ? 'folderList-item--active' : 'folderList-item'}
        title={fullPath || folderName}
      >
        {!isFolded && depth > 0 && (
          <span
            styleName='folderList-item-indent'
            style={{ width: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP }}
            aria-hidden='true'
          />
        )}
        {!isFolded && (
          <span
            styleName='folderList-item-expander-spacer'
            aria-hidden='true'
          />
        )}
        <span styleName='folderList-item-name'>
          <FolderIcon
            styleName='folderList-item-icon'
            color={folderColor}
            isActive={isActive}
          />
          <InlineRename
            className={styles['folderList-item-rename-input']}
            defaultValue={
              renameDefaultValue !== undefined ? renameDefaultValue : folderName
            }
            onConfirm={onRenameConfirm}
            onCancel={onRenameCancel}
          />
        </span>
      </div>
    )
  }
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
  showReorderHandle: PropTypes.bool,
  isEditing: PropTypes.bool,
  renameDefaultValue: PropTypes.string,
  onRenameConfirm: PropTypes.func,
  onRenameCancel: PropTypes.func
}

export default CSSModules(StorageItem, styles)
