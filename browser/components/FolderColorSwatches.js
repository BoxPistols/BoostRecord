/**
 * @fileoverview フォルダ色のスウォッチ一覧。
 *
 * サイドバーの色変更モーダルと、環境設定のフォルダ編集行の両方から使う。
 * 環境設定側は元々 SketchPicker を <button> の内側に描き、全画面を覆う
 * cover div も同じ内側に置いていた。ピッカー操作のクリックがボタンへ伝播し、
 * cover が閉じないまま残ると画面全体がクリック不能になる（例外は出ないので
 * 「フリーズした」ようにしか見えない）。入れ子の対話要素をやめてこれに寄せる。
 */
import PropTypes from 'prop-types'
import React from 'react'
import consts from 'browser/lib/consts'

const FolderColorSwatches = ({ value, onSelect, size = 26, columns = 6 }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, ${size}px)`,
      gap: 8,
      justifyContent: 'center'
    }}
  >
    {consts.FOLDER_COLORS.map((color, i) => (
      <button
        key={color}
        type='button'
        title={consts.FOLDER_COLOR_NAMES[i] || color}
        aria-label={consts.FOLDER_COLOR_NAMES[i] || color}
        aria-pressed={value === color}
        data-folder-swatch={color}
        onClick={e => {
          // 祖先のボタンやフォームに伝播させない（環境設定側は編集行の中に
          // 置くため、伝播すると blur -> confirm が走って閉じてしまう）
          e.preventDefault()
          e.stopPropagation()
          onSelect(color)
        }}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          border: '2px solid transparent',
          // 選択中の輪郭は白 + 同色の二重。同系色の枠だけだと明暗どちらの
          // テーマでも見分けがつかない
          boxShadow:
            value === color
              ? `0 0 0 2px #fff, 0 0 0 4px ${color}`
              : '0 0 0 1px rgba(128,128,128,0.5)',
          cursor: 'pointer',
          padding: 0
        }}
      />
    ))}
  </div>
)

FolderColorSwatches.propTypes = {
  value: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  size: PropTypes.number,
  columns: PropTypes.number
}

export default FolderColorSwatches
