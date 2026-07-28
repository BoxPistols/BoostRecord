/**
 * @fileoverview フォルダの色を選ぶモーダル。
 *
 * 右クリックのサブメニューに色名を並べる方式では実際の色が想起できなかった。
 * Electron の nativeImage は PNG/JPEG しか受け付けず SVG を描けないため、
 * ネイティブメニューに色見本を出すことはできない。実際の色を見せるには
 * DOM で描く必要があるので、軽量なモーダルにしている。
 */
import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './RenameModal.styl'
import dataApi from 'browser/main/lib/dataApi'
import { store } from 'browser/main/store'
import ModalEscButton from 'browser/components/ModalEscButton'
import i18n from 'browser/lib/i18n'
import consts from 'browser/lib/consts'
import { SketchPicker } from 'react-color'

class FolderColorModal extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      color: props.folder.color || consts.FOLDER_COLORS[0],
      showPicker: false
    }
  }

  handleKeyDown(e) {
    if (e.keyCode === 27) this.props.close()
  }

  /** プリセットは選んだ時点で確定する（1クリックで終わるのが本来の動線） */
  selectPreset(color) {
    this.setState({ color }, () => this.confirm())
  }

  confirm() {
    const { storage, folder } = this.props
    dataApi
      // updateFolder は name が文字列でないと reject するので現在名を渡す
      .updateFolder(storage.key, folder.key, {
        name: folder.name,
        color: this.state.color
      })
      .then(data => {
        store.dispatch({ type: 'UPDATE_FOLDER', storage: data.storage })
        this.props.close()
      })
      .catch(err => {
        console.error('Could not change the folder color', err)
        this.props.close()
      })
  }

  render() {
    const { folder } = this.props
    const { color, showPicker } = this.state

    const gridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 10,
      margin: '0 auto 16px',
      maxWidth: 260
    }
    const swatchStyle = c => ({
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: c,
      border: '2px solid transparent',
      // 選択中は輪郭を二重にする。色そのものと同系色の枠だと
      // 明暗のテーマ両方で見分けがつかなくなるため白 + 同色の二重にする
      boxShadow:
        color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : '0 0 0 1px #8888',
      cursor: 'pointer',
      padding: 0
    })

    return (
      <div
        styleName='root'
        tabIndex='-1'
        onKeyDown={e => this.handleKeyDown(e)}
      >
        <div styleName='header'>
          <div styleName='title'>
            {i18n.__('Change Folder Color')} — {folder.name}
          </div>
        </div>
        <ModalEscButton handleEscButtonClick={() => this.props.close()} />

        <div styleName='control'>
          <div style={gridStyle}>
            {consts.FOLDER_COLORS.map((c, i) => (
              <button
                key={c}
                title={consts.FOLDER_COLOR_NAMES[i] || c}
                aria-label={consts.FOLDER_COLOR_NAMES[i] || c}
                style={swatchStyle(c)}
                onClick={() => this.selectPreset(c)}
              />
            ))}
          </div>

          {showPicker ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SketchPicker
                color={color}
                onChange={c => this.setState({ color: c.hex })}
              />
            </div>
          ) : (
            <button
              styleName='control-confirmButton'
              style={{ background: 'transparent', border: '1px solid #8888' }}
              onClick={() => this.setState({ showPicker: true })}
            >
              {i18n.__('Custom color…')}
            </button>
          )}

          {showPicker && (
            <button
              styleName='control-confirmButton'
              onClick={() => this.confirm()}
            >
              {i18n.__('Confirm')}
            </button>
          )}
        </div>
      </div>
    )
  }
}

FolderColorModal.propTypes = {
  close: PropTypes.func.isRequired,
  storage: PropTypes.shape({ key: PropTypes.string }),
  folder: PropTypes.shape({
    key: PropTypes.string,
    name: PropTypes.string,
    color: PropTypes.string
  })
}

export default CSSModules(FolderColorModal, styles)
