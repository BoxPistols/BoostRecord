import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ReadAloudPlayer.styl'
import i18n from 'browser/lib/i18n'
import player, { SPEED_OPTIONS, SKIP_UNITS } from 'browser/main/lib/ttsPlayer'

const UNIT_LABELS = {
  chunk: 'Sentence group',
  paragraph: 'Paragraph',
  section: 'Heading'
}
import { getTtsConfig } from 'browser/main/lib/ttsAssist'

/** 文字を打っている最中か。打鍵中に Space を奪わないための判定 */
function isEditing(doc) {
  const el = doc && doc.activeElement
  if (!el) return false
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    // range / checkbox はプレーヤー自身の部品なので打鍵中ではない
    return (
      ['text', 'search', 'url', 'email', 'password', 'number'].indexOf(type) !==
      -1
    )
  }
  return el.isContentEditable === true
}

/**
 * ノート全体を読み上げる再生バー。ツールバーと本文の間に出る。
 * 再生の状態はアプリで 1 つの player が持ち、ここは表示と操作だけ。
 *
 * キー操作は DTM のトランスポートに倣う。ただしバーにマウスが乗っているか、
 * バー内にフォーカスがある時だけ受ける。エディタで打っている最中の Space や
 * 矢印は奪わない（行移動や入力はそのまま）
 */
class ReadAloudPlayer extends React.Component {
  constructor(props) {
    super(props)
    this.hover = false
    // シークバーを掴んでいる間の値。離した時に 1 回だけ seek する
    // （onChange のたびに合成すると、ドラッグ 1 回で数十回合成が走る）
    this.state = Object.assign({ scrub: null, help: false }, player.getState())
    this.handlePreviewClick = this.handlePreviewClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    // mouseenter/leave は React の合成イベント（mouseover 委譲）だと
    // 素の dispatchEvent で発火しない。実装も検証も素のリスナーで揃える
    this.handleMouseEnter = () => {
      this.hover = true
    }
    this.handleMouseLeave = () => {
      this.hover = false
    }
  }

  componentDidMount() {
    this.unsubscribe = player.subscribe(s => {
      const prev = this.state.startLine
      this.setState(s)
      // 読んでいる位置が変わった時だけ親へ知らせる（毎フレーム描き直さない）
      if (s.startLine !== prev && this.props.onLineChange) {
        this.props.onLineChange(s.startLine, s.endLine)
      }
    })
    // hover 中は window で受ける（バーの外にフォーカスがあっても効くように）
    window.addEventListener('keydown', this.handleKeyDown, true)
    if (this.rootRef) {
      this.rootRef.addEventListener('mouseenter', this.handleMouseEnter)
      this.rootRef.addEventListener('mouseleave', this.handleMouseLeave)
    }
    this.attachToPreviewFrames()
    // 開いた直後にすぐ聞けるようにする（右クリックの「ノート全体を読み上げ」）
    if (this.props.autoplay) this.handlePlay()
  }

  componentDidUpdate() {
    // プレビューは iframe。表示を切り替えると別の document になるので繋ぎ直す
    this.attachToPreviewFrames()
  }

  componentWillUnmount() {
    if (this.unsubscribe) this.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyDown, true)
    if (this.rootRef) {
      this.rootRef.removeEventListener('mouseenter', this.handleMouseEnter)
      this.rootRef.removeEventListener('mouseleave', this.handleMouseLeave)
    }
    ;(this.attachedDocs || []).forEach(doc => {
      try {
        doc.removeEventListener('keydown', this.handleKeyDown, true)
        doc.removeEventListener('click', this.handlePreviewClick, true)
      } catch (e) {
        /* iframe が既に消えている */
      }
    })
    this.attachedDocs = []
    if (this.props.onLineChange) this.props.onLineChange(null, null)
  }

  /**
   * プレビューの iframe にもキー操作を繋ぐ。
   * iframe にフォーカスがあると親 window の keydown は一切来ない
   * （ノート内検索が main プロセス経由なのと同じ理由）
   */
  attachToPreviewFrames() {
    if (!this.attachedDocs) this.attachedDocs = []
    const frames = document.querySelectorAll('iframe')
    for (let i = 0; i < frames.length; i++) {
      let doc = null
      try {
        doc = frames[i].contentDocument
      } catch (e) {
        continue // 別オリジンは触らない
      }
      if (!doc || this.attachedDocs.indexOf(doc) !== -1) continue
      doc.addEventListener('keydown', this.handleKeyDown, true)
      // 読みたい段落をクリックしたらそこから読む
      doc.addEventListener('click', this.handlePreviewClick, true)
      this.attachedDocs.push(doc)
    }
  }

  /**
   * バーが「アクティブ」= マウスが乗っている / 中にフォーカスがある /
   * プレビュー（iframe）を見ている。
   * プレビューには文字入力が無いので、読みながら Space で止められる方が良い
   */
  isActive(eventDoc) {
    if (this.hover) return true
    const root = this.rootRef
    if (root && root.contains(document.activeElement)) return true
    // 別 document（プレビューの iframe）から来たキーはプレビュー操作とみなす
    return !!(eventDoc && eventDoc !== document)
  }

  handleKeyDown(e) {
    const doc = (e.target && e.target.ownerDocument) || document
    if (!this.isActive(doc)) return
    // 文字を打っている最中は一切奪わない。Space が入らなくなるため
    if (isEditing(doc) || isEditing(document)) return
    // バーの select / range に載っている時は、その部品の操作を優先する
    const tag = (e.target && e.target.tagName) || ''
    const inControl = tag === 'SELECT' || tag === 'INPUT'
    const mod = e.metaKey || e.ctrlKey
    let handled = true
    if (e.key === ' ' && !mod && !e.shiftKey && !e.altKey) {
      this.handlePlay()
    } else if (e.key === 'Escape') {
      player.stop()
    } else if (e.key === 'ArrowUp' && e.shiftKey && !mod) {
      player.stepVolume(1)
    } else if (e.key === 'ArrowDown' && e.shiftKey && !mod) {
      player.stepVolume(-1)
    } else if (e.key === 'ArrowRight' && mod && !e.shiftKey) {
      player.stepSpeed(1)
    } else if (e.key === 'ArrowLeft' && mod && !e.shiftKey) {
      player.stepSpeed(-1)
    } else if (e.key === 'ArrowRight' && !mod && !e.shiftKey && !inControl) {
      player.next()
    } else if (e.key === 'ArrowLeft' && !mod && !e.shiftKey && !inControl) {
      player.prev()
    } else {
      handled = false
    }
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  /**
   * プレビューのブロックをクリックしたら、その行から読む。
   * リンク・チェックボックス・コード・文字選択中は本来の操作を優先する
   */
  handlePreviewClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey) return
    const doc = e.target && e.target.ownerDocument
    const sel = doc && doc.getSelection && doc.getSelection()
    if (sel && String(sel).length) return
    let el = e.target
    while (el && el !== doc.body) {
      const tag = (el.tagName || '').toUpperCase()
      if (
        ['A', 'INPUT', 'BUTTON', 'PRE', 'CODE', 'LABEL'].indexOf(tag) !== -1
      ) {
        return
      }
      if (el.hasAttribute && el.hasAttribute('data-line')) break
      el = el.parentElement
    }
    if (!el || el === doc.body) return
    const line = parseInt(el.getAttribute('data-line'), 10)
    if (isNaN(line)) return
    if (!player.getState().total) {
      if (this.loadContent() === 0) return
    }
    player.seekToLine(line)
  }

  // 一時停止からは続きを、それ以外は今の本文を読み直す。
  // 編集した直後に古い本文を読まないよう、開始のたびに本文を取り直す
  handlePlay() {
    const { status } = this.state
    if (status === 'paused' || status === 'playing' || status === 'loading') {
      player.toggle()
      return
    }
    if (this.loadContent() === 0) return
    player.play()
  }

  loadContent() {
    return player.load(this.props.getContent(), { label: this.state.label })
  }

  // エディタのカーソル行から。塊が無ければ本文を読み込んでから探す
  handlePlayFromCursor() {
    const line = this.props.getCursorLineNumber
      ? this.props.getCursorLineNumber()
      : null
    if (line == null) return
    if (!player.getState().total) {
      if (this.loadContent() === 0) return
    }
    player.seekToLine(line)
  }

  // 離した時に 1 回だけ飛ぶ
  handleSeekCommit() {
    const v = this.state.scrub
    this.setState({ scrub: null })
    if (v == null) return
    if (!player.getState().total) {
      if (this.loadContent() === 0) return
    }
    player.seekUnit(Number(v) - 1)
  }

  // キー案内。バーの下に半透明で重ねる（設定 > ホットキーの値を読む）
  renderHelp() {
    const ConfigManager = require('browser/main/lib/ConfigManager').default
    const hk = (ConfigManager.get() || {}).hotkey || {}
    const rows = [
      [i18n.__('Play / pause'), 'Space', hk.playerToggle],
      [i18n.__('Stop (keeps the position)'), 'Esc', hk.playerStop],
      [
        i18n.__('Previous') + ' / ' + i18n.__('Next'),
        '← / →',
        `${hk.playerPrev || ''} / ${hk.playerNext || ''}`
      ],
      [
        i18n.__('Volume'),
        '⇧↑ / ⇧↓',
        `${hk.playerVolumeUp || ''} / ${hk.playerVolumeDown || ''}`
      ],
      [
        i18n.__('Speed'),
        '⌘← / ⌘→',
        `${hk.playerSpeedDown || ''} / ${hk.playerSpeedUp || ''}`
      ]
    ]
    return (
      <div
        styleName='help'
        role='dialog'
        aria-label={i18n.__('Keyboard shortcuts')}
      >
        <div styleName='help-note'>
          {i18n.__(
            'Left column works while the mouse is over this bar or while reading the preview. It never fires while you are typing in the editor. Right column works anywhere.'
          )}
        </div>
        <table styleName='help-table'>
          <thead>
            <tr>
              <th />
              <th>{i18n.__('On the bar / preview')}</th>
              <th>{i18n.__('Anywhere')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, local, global]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <kbd>{local}</kbd>
                </td>
                <td>{global ? <kbd>{global}</kbd> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div styleName='help-note'>
          {i18n.__(
            'Click a paragraph in the preview to read from there. Change the keys in Settings > Hotkeys > Audio player.'
          )}
        </div>
      </div>
    )
  }

  render() {
    const {
      status,
      index,
      total,
      volume,
      speed,
      label,
      error,
      skipUnit,
      unitIndex,
      unitTotal
    } = this.state
    const unit = skipUnit || 'paragraph'
    const unitName = i18n.__(UNIT_LABELS[unit])
    const { style, onClose } = this.props
    const busy = status === 'playing' || status === 'loading'
    const hasChunks = total > 0
    // 設定の話速に倍速を掛けた実効値。上限に張り付くと倍速を上げても
    // 変わらないので、その旨を出す
    // 話速は絶対値。設定の値と違えば「設定: 1.20」を添えて、どちらが効いて
    // いるか分かるようにする
    const baseSpeed = getTtsConfig().params.speed
    const shownSpeed = speed == null ? baseSpeed : speed
    const speedTitle =
      `${i18n.__('Speed')} ${Number(shownSpeed).toFixed(2)}` +
      (Math.abs(shownSpeed - baseSpeed) > 0.001
        ? `（${i18n.__('setting')}: ${baseSpeed.toFixed(2)}）`
        : '')
    const speedChoices =
      SPEED_OPTIONS.indexOf(shownSpeed) === -1
        ? SPEED_OPTIONS.concat([shownSpeed]).sort((a, b) => a - b)
        : SPEED_OPTIONS
    const progress =
      status === 'loading'
        ? i18n.__('Synthesizing…')
        : hasChunks
        ? `${Math.min(index + 1, total)} / ${total}`
        : ''
    return (
      <div
        ref={el => {
          this.rootRef = el
        }}
        styleName='root'
        style={style}
        role='group'
        aria-label={i18n.__('Read aloud')}
        tabIndex={-1}
      >
        <button
          styleName='button'
          onClick={() => player.restart()}
          disabled={!hasChunks}
          title={i18n.__('Play from the beginning')}
          aria-label={i18n.__('Play from the beginning')}
        >
          <i className='fa fa-fast-backward' aria-hidden='true' />
        </button>
        <button
          styleName='button'
          onClick={() => player.prev()}
          disabled={!hasChunks}
          title={`${i18n.__('Previous')} ${unitName} (←)`}
          aria-label={i18n.__('Previous')}
        >
          <i className='fa fa-step-backward' aria-hidden='true' />
        </button>
        <button
          styleName='button--primary'
          onClick={() => this.handlePlay()}
          title={`${busy ? i18n.__('Pause') : i18n.__('Play')} (Space)`}
          aria-label={busy ? i18n.__('Pause') : i18n.__('Play')}
        >
          <i
            className={busy ? 'fa fa-pause' : 'fa fa-play'}
            aria-hidden='true'
          />
        </button>
        <button
          styleName='button'
          onClick={() => player.stop()}
          disabled={status === 'idle'}
          title={`${i18n.__('Stop (keeps the position)')} (Esc)`}
          aria-label={i18n.__('Stop')}
        >
          <i className='fa fa-stop' aria-hidden='true' />
        </button>
        <button
          styleName='button'
          onClick={() => player.next()}
          disabled={!hasChunks}
          title={`${i18n.__('Next')} ${unitName} (→)`}
          aria-label={i18n.__('Next')}
        >
          <i className='fa fa-step-forward' aria-hidden='true' />
        </button>
        <button
          styleName='button'
          onClick={() => this.handlePlayFromCursor()}
          disabled={
            !this.props.getCursorLineNumber ||
            this.props.getCursorLineNumber() == null
          }
          title={i18n.__('Play from cursor line')}
          aria-label={i18n.__('Play from cursor line')}
        >
          <i className='fa fa-i-cursor' aria-hidden='true' />
        </button>

        {/* 位置。塊の番号をそのまま目盛りにしたシークバー */}
        <input
          styleName='seek'
          type='range'
          min='1'
          max={Math.max(1, unitTotal)}
          step='1'
          title={`${i18n.__('Position')}（${unitName}）`}
          value={
            this.state.scrub != null
              ? this.state.scrub
              : hasChunks
              ? Math.min(unitIndex + 1, unitTotal)
              : 1
          }
          disabled={!hasChunks}
          onChange={e => this.setState({ scrub: e.target.value })}
          onMouseUp={() => this.handleSeekCommit()}
          onTouchEnd={() => this.handleSeekCommit()}
          onKeyUp={() => this.handleSeekCommit()}
          onBlur={() => this.handleSeekCommit()}
          aria-label={i18n.__('Position')}
        />
        <span
          styleName='progress'
          title={`${unitName} ${unitIndex + 1} / ${unitTotal}`}
        >
          {status === 'loading'
            ? progress
            : hasChunks
            ? `${unitIndex + 1} / ${unitTotal}`
            : ''}
        </span>
        <select
          styleName='select'
          value={unit}
          onChange={e => player.setSkipUnit(e.target.value)}
          title={i18n.__('Skip unit for previous / next and the position bar')}
          aria-label={i18n.__('Skip unit')}
        >
          {SKIP_UNITS.map(u => (
            <option key={u} value={u}>
              {i18n.__(UNIT_LABELS[u])}
            </option>
          ))}
        </select>
        {label && <span styleName='label'>{label}</span>}

        <label styleName='control'>
          <span styleName='control-name'>{i18n.__('Speed')}</span>
          <select
            styleName='select'
            value={String(shownSpeed)}
            onChange={e => player.setSpeed(Number(e.target.value))}
            title={`${speedTitle} (⌘←/→)`}
            aria-label={i18n.__('Speed')}
          >
            {speedChoices.map(s => (
              <option key={s} value={String(s)}>
                {Number(s).toFixed(2)}
              </option>
            ))}
          </select>
        </label>

        <label styleName='control' title={`${i18n.__('Volume')} (⇧↑/↓)`}>
          <i className='fa fa-volume-up' aria-hidden='true' />
          <input
            styleName='range'
            type='range'
            min='0'
            max='1'
            step='0.05'
            value={volume}
            onChange={e => player.setVolume(Number(e.target.value))}
            aria-label={i18n.__('Volume')}
          />
        </label>

        {error && (
          <span styleName='error' title={error}>
            {error.split('\n')[0]}
          </span>
        )}

        <button
          styleName={this.state.help ? 'button--active' : 'button'}
          onClick={() => this.setState({ help: !this.state.help })}
          title={i18n.__('Keyboard shortcuts')}
          aria-label={i18n.__('Keyboard shortcuts')}
          aria-pressed={this.state.help}
        >
          <i className='fa fa-keyboard-o' aria-hidden='true' />
        </button>
        {this.state.help && this.renderHelp()}

        <button
          styleName='button--close'
          onClick={() => onClose()}
          title={i18n.__('Close')}
          aria-label={i18n.__('Close')}
        >
          <i className='fa fa-times' aria-hidden='true' />
        </button>
      </div>
    )
  }
}

ReadAloudPlayer.propTypes = {
  /** 読み上げる本文（開始のたびに呼ぶ） */
  getContent: PropTypes.func.isRequired,
  /** エディタのカーソル行（0 始まり）。プレビュー中は null */
  getCursorLineNumber: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  /** 読んでいる行が変わった時に呼ぶ。ハイライトは親（ノート）が持つ */
  onLineChange: PropTypes.func,
  autoplay: PropTypes.bool,
  style: PropTypes.object
}

export default CSSModules(ReadAloudPlayer, styles)
