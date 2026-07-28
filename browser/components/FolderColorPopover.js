/**
 * @fileoverview フォルダ色のポップオーバー。右クリックした位置に小さく出す。
 *
 * 経緯:
 * - 当初はネイティブメニューのサブメニューに色名を並べていたが、実際の色が
 *   想起できなかった（Electron の nativeImage は PNG/JPEG のみで、色見本を
 *   動的に作れない）
 * - 次に全画面のモーダルにしたが、画面全体を覆うのは大げさすぎた
 * - 環境設定側で使っていた「全画面を覆う cover div」方式は、クリックが祖先へ
 *   伝播して cover が閉じないと画面全体がクリック不能になる事故を起こした。
 *   ここでは cover を置かず、document の mousedown を購読して外側判定する
 *
 * 位置は fixed + createPortal(document.body)。祖先の overflow に切られず、
 * ウィンドウ端でも収まるようクランプする。
 */
import PropTypes from 'prop-types'
import React from 'react'
import { createPortal } from 'react-dom'
import FolderColorSwatches from 'browser/components/FolderColorSwatches'

const WIDTH = 232
const PADDING = 12

class FolderColorPopover extends React.Component {
  constructor(props) {
    super(props)
    this.handleOutside = this.handleOutside.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.ref = React.createRef()
  }

  componentDidMount() {
    // cover div ではなく document の購読で閉じる。cover は他の操作まで
    // 遮ってしまい、閉じそこねると画面全体が操作不能になる
    document.addEventListener('mousedown', this.handleOutside, true)
    document.addEventListener('keydown', this.handleKeyDown, true)
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleOutside, true)
    document.removeEventListener('keydown', this.handleKeyDown, true)
  }

  handleOutside(e) {
    const el = this.ref.current
    if (el && !el.contains(e.target)) this.props.onClose()
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') this.props.onClose()
  }

  render() {
    const { x, y, value, onSelect, onClose } = this.props

    // ウィンドウ外へはみ出さないよう寄せる。高さは 2 段 + 余白の実寸
    const height = 2 * 26 + 8 + PADDING * 2
    const left = Math.max(
      PADDING,
      Math.min(x, window.innerWidth - WIDTH - PADDING)
    )
    const top = Math.max(
      PADDING,
      Math.min(y, window.innerHeight - height - PADDING)
    )

    return createPortal(
      <div
        ref={this.ref}
        role='dialog'
        aria-label={this.props.label}
        style={{
          position: 'fixed',
          left,
          top,
          width: WIDTH,
          padding: PADDING,
          boxSizing: 'border-box',
          borderRadius: 8,
          background: '#2b2b2e',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          zIndex: 1100
        }}
      >
        <FolderColorSwatches
          value={value}
          onSelect={color => {
            onSelect(color)
            onClose()
          }}
        />
      </div>,
      document.body
    )
  }
}

FolderColorPopover.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  value: PropTypes.string,
  label: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default FolderColorPopover
