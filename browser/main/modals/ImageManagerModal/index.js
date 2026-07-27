/**
 * @fileoverview Media Library — browse every attachment image across all
 * storages, see which notes reference each, and rename / replace / delete
 * (physically, verified) with dry-run previews and backups.
 */
import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ImageManagerModal.styl'
import i18n from 'browser/lib/i18n'
import dataApi from 'browser/main/lib/dataApi'
import { store } from 'browser/main/store'
const { pathToFileURL } = require('url')
const remote = require('@electron/remote')

function fileUrl(absPath) {
  return pathToFileURL(absPath).href
}

function humanSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Thumbnail that only loads its image once scrolled into view — keeps the grid
// responsive with hundreds of (possibly cloud-placeholder) files.
class LazyImg extends React.Component {
  constructor(props) {
    super(props)
    this.state = { show: false, failed: false }
    this.ref = React.createRef()
  }
  componentDidMount() {
    this.obs = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          this.setState({ show: true })
          this.obs.disconnect()
        }
      },
      { root: this.props.root || null, rootMargin: '200px' }
    )
    if (this.ref.current) this.obs.observe(this.ref.current)
  }
  componentWillUnmount() {
    if (this.obs) this.obs.disconnect()
  }
  render() {
    const { src, alt } = this.props
    return (
      <div ref={this.ref} className={this.props.className}>
        {this.state.show && !this.state.failed ? (
          <img
            src={src}
            alt={alt}
            onError={() => this.setState({ failed: true })}
          />
        ) : (
          <span className={this.props.placeholderClassName}>
            {this.state.failed ? '⚠' : '…'}
          </span>
        )}
      </div>
    )
  }
}
LazyImg.propTypes = { src: PropTypes.string, alt: PropTypes.string }

class ImageManagerModal extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      loading: true,
      error: null,
      attachments: [],
      trash: [],
      noteLoadFailed: false,
      filter: 'all', // all | unused | broken | trash
      selected: {}, // absPath -> true (bulk)
      detail: null, // the focused attachment
      busy: false,
      notice: null,
      renaming: false, // inline rename mode for the detail pane
      renameValue: '' // the base name being edited (extension appended on commit)
    }
    this.gridRef = React.createRef()
  }

  componentDidMount() {
    this.load()
  }

  load() {
    this.setState({ loading: true, error: null, selected: {} })
    // 保持期間を過ぎたゴミ箱の中身はここで初めて実体を消す。main プロセスの
    // 起動フックに置くと変更のたびに Electron 再起動が要るため画面側で回す。
    const trashPromise = dataApi
      .purgeExpiredTrash(this.props.storageList)
      .catch(() => null)
      .then(() => dataApi.listTrashedAttachments(this.props.storageList))
      .catch(() => [])
    Promise.all([dataApi.listAttachments(this.props.storageList), trashPromise])
      .then(([{ attachments, noteLoadFailed }, trashed]) => {
        attachments.sort(
          (a, b) => Number(b.broken) - Number(a.broken) || b.size - a.size
        )
        // ゴミ箱の項目もカード描画を使い回せるよう、一覧と同じ形に寄せる。
        // attachments 配列には混ぜない（「未使用をすべて削除」の対象に
        // ゴミ箱の中身が入ってしまうため）。
        const trash = (trashed || []).map(e =>
          Object.assign({}, e, {
            absPath: e.trashPath,
            referenced: false,
            broken: false,
            isTrash: true,
            referencingNotes: []
          })
        )
        this.setState(prev => {
          const pool = attachments.concat(trash)
          const keep =
            prev.detail && pool.find(a => a.absPath === prev.detail.absPath)
          return {
            attachments,
            trash,
            noteLoadFailed,
            loading: false,
            detail: keep || null
          }
        })
      })
      .catch(err => this.setState({ loading: false, error: String(err) }))
  }

  visible() {
    const { attachments, trash, filter } = this.state
    if (filter === 'trash') return trash
    if (filter === 'unused') return attachments.filter(a => !a.referenced)
    if (filter === 'broken') return attachments.filter(a => a.broken)
    return attachments
  }

  toggleSelect(absPath, e) {
    if (e) e.stopPropagation()
    const selected = Object.assign({}, this.state.selected)
    if (selected[absPath]) delete selected[absPath]
    else selected[absPath] = true
    this.setState({ selected })
  }

  // ---- destructive / mutating actions ----

  deletePaths(items) {
    // Broken items have no file to delete — "deleting" one means removing its
    // dangling reference from the note(s). Handle both in one bulk action so a
    // selected broken entry can actually be cleared (previously it silently
    // reported "Nothing to delete").
    const realFiles = items.filter(a => !a.broken)
    const brokenItems = items.filter(a => a.broken)
    const paths = realFiles.map(a => a.absPath)
    if (paths.length === 0 && brokenItems.length === 0) {
      this.setState({ notice: i18n.__('Nothing to delete') })
      return
    }
    const parts = []
    if (paths.length)
      parts.push(
        i18n
          .__('Move %n image file(s) to the trash.')
          .replace('%n', paths.length)
      )
    if (brokenItems.length)
      parts.push(
        i18n
          .__('Remove %n broken reference(s) from notes (a backup is saved).')
          .replace('%n', brokenItems.length)
      )
    // 実体は復元可能になったが、壊れた参照の除去はノート本文の書き換えなので
    // 元に戻せない（バックアップは取る）。両方ある時は両方伝える
    if (paths.length)
      parts.push(
        i18n
          .__('You can restore them from the trash for %d days.')
          .replace('%d', dataApi.TRASH_RETENTION_DAYS)
      )
    if (brokenItems.length)
      parts.push(i18n.__('Reference removal cannot be undone.'))
    if (!window.confirm(parts.join('\n'))) return
    this.setState({ busy: true, notice: null })
    const jobs = []
    if (paths.length) jobs.push(dataApi.trashAttachments(paths))
    brokenItems.forEach(a =>
      jobs.push(
        dataApi
          .removeBrokenReferences({
            storageKey: a.storageKey,
            noteKey: a.noteKey,
            fileName: a.fileName
          })
          .then(res => {
            if (res && res.updatedNotes)
              res.updatedNotes.forEach(note =>
                store.dispatch({ type: 'UPDATE_NOTE', note })
              )
            return res
          })
      )
    )
    Promise.all(jobs)
      .then(results => {
        const moved = (paths.length && results[0] && results[0].trashed) || []
        const failed = (paths.length && results[0] && results[0].failed) || []
        const notice = [
          paths.length ? i18n.__('Moved to trash') + ': ' + moved.length : '',
          failed.length ? i18n.__('Failed') + ': ' + failed.length : '',
          brokenItems.length
            ? i18n.__('References removed') + ': ' + brokenItems.length
            : ''
        ]
          .filter(Boolean)
          .join(' · ')
        this.setState({ busy: false, notice })
        this.load()
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  // ---- ゴミ箱の操作 ----

  restoreItems(items) {
    if (!items.length) {
      this.setState({ notice: i18n.__('Nothing to restore') })
      return
    }
    this.setState({ busy: true, notice: null })
    dataApi
      .restoreTrashedAttachments(items)
      .then(({ restored, failed }) => {
        const renamed = restored.filter(r => r.renamed).length
        const notice = [
          i18n.__('Restored') + ': ' + restored.length,
          // 復元先に同名ファイルがあった場合は上書きせず別名にしている。
          // 黙って名前が変わると参照が繋がらないので必ず知らせる。
          renamed
            ? i18n.__('Renamed to avoid overwriting: %n').replace('%n', renamed)
            : '',
          failed.length ? i18n.__('Failed') + ': ' + failed.length : ''
        ]
          .filter(Boolean)
          .join(' · ')
        this.setState({ busy: false, notice })
        this.load()
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  purgeItems(items) {
    if (!items.length) {
      this.setState({ notice: i18n.__('Nothing to delete') })
      return
    }
    if (
      !window.confirm(
        i18n
          .__('Permanently delete %n item(s) from the trash.')
          .replace('%n', items.length) +
          '\n\n' +
          i18n.__('This cannot be undone.')
      )
    )
      return
    this.setState({ busy: true, notice: null })
    dataApi
      .purgeTrashedAttachments(items)
      .then(({ deleted, failed }) => {
        const notice = [
          i18n.__('Deleted') + ': ' + deleted.length,
          failed.length ? i18n.__('Failed') + ': ' + failed.length : ''
        ]
          .filter(Boolean)
          .join(' · ')
        this.setState({ busy: false, notice })
        this.load()
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  // Enter inline rename mode. window.prompt() is disabled in Electron
  // (returns null), so the rename is done with an in-app text field instead.
  startRename() {
    const a = this.state.detail
    if (!a || a.broken) return
    const dot = a.fileName.lastIndexOf('.')
    const base = dot > 0 ? a.fileName.slice(0, dot) : a.fileName
    this.setState({ renaming: true, renameValue: base, notice: null })
  }

  cancelRename() {
    this.setState({ renaming: false, renameValue: '' })
  }

  commitRename() {
    const a = this.state.detail
    if (!a || a.broken) return this.cancelRename()
    const dot = a.fileName.lastIndexOf('.')
    const ext = dot > 0 ? a.fileName.slice(dot) : ''
    const raw = (this.state.renameValue || '').trim()
    if (!raw) return
    const newName = raw.endsWith(ext) ? raw : raw + ext
    if (newName === a.fileName) return this.cancelRename()
    // Only allow characters the storage-reference parser understands; anything
    // else (spaces, slashes, parens…) would desync the note reference from the
    // file and orphan the image. Keep the input open so the user can fix it.
    if (!/^[\w.-]+$/.test(newName)) {
      this.setState({
        notice: i18n.__(
          'File name may only contain letters, numbers, ".", "-" and "_".'
        )
      })
      return
    }
    const args = {
      storageKey: a.storageKey,
      noteKey: a.noteKey,
      oldName: a.fileName,
      newName
    }
    this.setState({ busy: true, renaming: false, notice: null })
    dataApi
      .renameAttachment(Object.assign({ dryRun: true }, args))
      .then(({ affected }) => {
        if (
          !window.confirm(
            i18n
              .__('This updates %n note(s). A backup will be saved. Proceed?')
              .replace('%n', affected.length) +
              (affected.length
                ? '\n\n' +
                  affected.map(n => '• ' + (n.title || n.noteKey)).join('\n')
                : '')
          )
        ) {
          this.setState({ busy: false })
          return
        }
        return dataApi
          .renameAttachment(Object.assign({ dryRun: false }, args))
          .then(res => this.finishOp(res))
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  fixBrokenDetail() {
    const a = this.state.detail
    if (!a || !a.broken) return
    if (
      !window.confirm(
        i18n
          .__(
            'Remove all references to this missing file from %n note(s)? A backup will be saved.'
          )
          .replace('%n', a.referencingNotes.length)
      )
    )
      return
    this.setState({ busy: true, notice: null })
    dataApi
      .removeBrokenReferences({
        storageKey: a.storageKey,
        noteKey: a.noteKey,
        fileName: a.fileName
      })
      .then(res => this.finishOp(res, i18n.__('Fixed')))
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  replaceDetail() {
    const a = this.state.detail
    if (!a || a.broken) return
    remote.dialog
      .showOpenDialog(remote.getCurrentWindow(), {
        title: i18n.__('Choose replacement image'),
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
          }
        ]
      })
      .then(({ canceled, filePaths }) => {
        if (canceled || !filePaths || !filePaths[0]) return
        this.setState({ busy: true, notice: null })
        return dataApi
          .replaceAttachment({ absPath: a.absPath, newFilePath: filePaths[0] })
          .then(res => this.finishOp(res, i18n.__('Replaced')))
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  // Persist store updates from an op, then reload.
  finishOp(res, noticeLabel) {
    if (res && res.updatedNotes) {
      res.updatedNotes.forEach(note =>
        store.dispatch({ type: 'UPDATE_NOTE', note })
      )
    }
    this.setState({
      busy: false,
      notice:
        (noticeLabel || i18n.__('Done')) +
        (res && res.backupDir ? ' · ' + i18n.__('backup saved') : '')
    })
    this.load()
  }

  render() {
    const { close } = this.props
    const {
      loading,
      error,
      attachments,
      noteLoadFailed,
      filter,
      selected,
      detail,
      busy,
      notice
    } = this.state

    const { trash } = this.state
    const unused = attachments.filter(a => !a.referenced && !a.broken)
    const broken = attachments.filter(a => a.broken)
    const totalSize = attachments.reduce((s, a) => s + a.size, 0)
    const list = this.visible()
    // 選択はタブ内で完結させる（一覧の選択がゴミ箱の一括操作へ漏れないよう）
    const selectedItems = (filter === 'trash' ? trash : attachments).filter(
      a => selected[a.absPath]
    )

    return (
      <div styleName='root'>
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Image Manager')}</div>
          {/* close is only supplied via openModal; omitted when embedded in
              the Preferences Images tab, so render the × only when present. */}
          {close && (
            <button
              styleName='close'
              aria-label={i18n.__('Close')}
              onClick={() => close()}
            >
              ×
            </button>
          )}
        </div>

        <div styleName='summary'>
          {loading
            ? i18n.__('Scanning…')
            : `${attachments.length} ${i18n.__('images')} · ${humanSize(
                totalSize
              )} · ${unused.length} ${i18n.__('unused')} · ${
                broken.length
              } ${i18n.__('broken')}`}
          {notice && <span styleName='notice'>{notice}</span>}
        </div>

        {noteLoadFailed && (
          <div styleName='warning'>
            {i18n.__(
              'Some notes could not be read, so "unused" may be inaccurate. Bulk-deleting unused images is disabled; delete individually with care.'
            )}
          </div>
        )}

        <div styleName='toolbar'>
          <div styleName='filters'>
            {['all', 'unused', 'broken', 'trash'].map(f => (
              <button
                key={f}
                styleName={filter === f ? 'tab--active' : 'tab'}
                onClick={() => this.setState({ filter: f, selected: {} })}
              >
                {f === 'all'
                  ? i18n.__('All')
                  : f === 'unused'
                  ? `${i18n.__('Unused')} (${unused.length})`
                  : f === 'broken'
                  ? `${i18n.__('Broken')} (${broken.length})`
                  : `${i18n.__('Trash')} (${trash.length})`}
              </button>
            ))}
          </div>
          <div styleName='actions'>
            {filter === 'trash' ? (
              <React.Fragment>
                <button
                  styleName='action'
                  disabled={busy || selectedItems.length === 0}
                  onClick={() => this.restoreItems(selectedItems)}
                >
                  {i18n.__('Restore selected')} ({selectedItems.length})
                </button>
                <button
                  styleName='action'
                  disabled={busy || selectedItems.length === 0}
                  onClick={() => this.purgeItems(selectedItems)}
                >
                  {i18n.__('Delete permanently')}
                </button>
                <button
                  styleName='action--danger'
                  disabled={busy || trash.length === 0}
                  onClick={() => this.purgeItems(trash)}
                >
                  {i18n.__('Empty trash')}
                </button>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <button
                  styleName='action'
                  disabled={busy || selectedItems.length === 0}
                  onClick={() => this.deletePaths(selectedItems)}
                >
                  {i18n.__('Delete selected')} ({selectedItems.length})
                </button>
                <button
                  styleName='action--danger'
                  disabled={busy || noteLoadFailed || unused.length === 0}
                  title={
                    noteLoadFailed
                      ? i18n.__('Disabled: some notes could not be read')
                      : ''
                  }
                  onClick={() => this.deletePaths(unused)}
                >
                  {i18n.__('Delete all unused')}
                </button>
              </React.Fragment>
            )}
          </div>
        </div>

        <div styleName='body'>
          <div styleName='grid' ref={this.gridRef}>
            {loading && <div styleName='empty'>{i18n.__('Scanning…')}</div>}
            {error && <div styleName='empty'>{error}</div>}
            {!loading && !error && list.length === 0 && (
              <div styleName='empty'>
                {filter === 'trash'
                  ? i18n.__('The trash is empty')
                  : i18n.__('No images')}
              </div>
            )}
            {!loading &&
              list.map(a => (
                <div
                  key={a.absPath}
                  styleName={
                    detail && detail.absPath === a.absPath
                      ? 'card--focus'
                      : selected[a.absPath]
                      ? 'card--selected'
                      : 'card'
                  }
                  onClick={() => this.setState({ detail: a, renaming: false })}
                >
                  <div styleName='thumb'>
                    {a.broken ? (
                      <span styleName='broken-mark'>⚠</span>
                    ) : (
                      <LazyImg
                        src={fileUrl(a.absPath)}
                        alt={a.fileName}
                        root={this.gridRef.current}
                        placeholderClassName={styles['thumb-ph']}
                      />
                    )}
                    {a.broken && (
                      <span styleName='badge-broken'>{i18n.__('Broken')}</span>
                    )}
                    {a.isTrash && (
                      <span styleName='badge-unused'>
                        {a.daysLeft === null
                          ? i18n.__('Kept')
                          : i18n.__('%d days left').replace('%d', a.daysLeft)}
                      </span>
                    )}
                    {!a.referenced && !a.broken && !a.isTrash && (
                      <span styleName='badge-unused'>{i18n.__('Unused')}</span>
                    )}
                  </div>
                  <div styleName='meta'>
                    <div styleName='filename' title={a.fileName}>
                      {a.fileName}
                    </div>
                    <div styleName='sub'>
                      {a.broken ? a.storageName : humanSize(a.size)}
                    </div>
                  </div>
                  <input
                    type='checkbox'
                    styleName='check'
                    checked={!!selected[a.absPath]}
                    onClick={e => this.toggleSelect(a.absPath, e)}
                    readOnly
                  />
                </div>
              ))}
          </div>

          <div styleName='detail'>
            {!detail ? (
              <div styleName='detail-empty'>{i18n.__('Select an image')}</div>
            ) : (
              <div styleName='detail-inner'>
                <div styleName='detail-preview'>
                  {detail.broken ? (
                    <span styleName='broken-mark'>⚠</span>
                  ) : (
                    <img src={fileUrl(detail.absPath)} alt={detail.fileName} />
                  )}
                </div>
                {this.state.renaming ? (
                  <div styleName='detail-rename'>
                    <input
                      styleName='detail-rename-input'
                      value={this.state.renameValue}
                      autoFocus
                      onChange={e =>
                        this.setState({ renameValue: e.target.value })
                      }
                      onKeyDown={e => {
                        if (e.nativeEvent && e.nativeEvent.isComposing) return
                        if (e.key === 'Enter') this.commitRename()
                        if (e.key === 'Escape') this.cancelRename()
                      }}
                    />
                    <span styleName='detail-rename-ext'>
                      {detail.fileName.slice(detail.fileName.lastIndexOf('.'))}
                    </span>
                    <button
                      styleName='detail-btn'
                      disabled={busy}
                      onClick={() => this.commitRename()}
                    >
                      {i18n.__('OK')}
                    </button>
                    <button
                      styleName='detail-btn'
                      onClick={() => this.cancelRename()}
                    >
                      {i18n.__('Cancel')}
                    </button>
                  </div>
                ) : (
                  <div styleName='detail-name' title={detail.fileName}>
                    {detail.fileName}
                  </div>
                )}
                <div styleName='detail-row'>
                  {detail.broken
                    ? i18n.__('Missing file (referenced but not on disk)')
                    : `${humanSize(detail.size)} · ${detail.storageName}`}
                </div>
                {detail.isTrash && (
                  <div styleName='detail-row'>
                    {detail.deletedAt
                      ? `${i18n.__('Deleted at')} ${new Date(
                          detail.deletedAt
                        ).toLocaleString()}`
                      : i18n.__('Deletion date unknown (kept indefinitely)')}
                  </div>
                )}
                {detail.isTrash && !detail.restorable && (
                  <div styleName='detail-row'>
                    {i18n.__(
                      'Restore information is missing, so this file cannot be put back automatically.'
                    )}
                  </div>
                )}
                {/* ゴミ箱の項目は参照が無いから捨てられたもの。参照数を出すと
                    「参照されていない＝異常」と読めてしまうので出さない */}
                {!detail.isTrash && (
                  <div styleName='detail-refs-title'>
                    {i18n.__('Referenced by')} ({detail.referencingNotes.length}
                    )
                  </div>
                )}
                {!detail.isTrash && (
                  <div styleName='detail-refs'>
                    {detail.referencingNotes.length === 0 ? (
                      <div styleName='detail-orphan'>
                        {i18n.__('Not referenced by any note (unused)')}
                      </div>
                    ) : (
                      detail.referencingNotes.map((n, i) => (
                        <div key={i} styleName='detail-ref'>
                          {n.title || n.noteKey}
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div styleName='detail-actions'>
                  {detail.isTrash && (
                    <button
                      styleName='detail-btn'
                      disabled={busy || !detail.restorable}
                      onClick={() => this.restoreItems([detail])}
                    >
                      {i18n.__('Restore')}
                    </button>
                  )}
                  {detail.isTrash && (
                    <button
                      styleName='detail-btn--danger'
                      disabled={busy}
                      onClick={() => this.purgeItems([detail])}
                    >
                      {i18n.__('Delete permanently')}
                    </button>
                  )}
                  {!detail.broken && !detail.isTrash && (
                    <button
                      styleName='detail-btn'
                      disabled={busy || this.state.renaming}
                      onClick={() => this.startRename()}
                    >
                      {i18n.__('Rename')}
                    </button>
                  )}
                  {!detail.broken && !detail.isTrash && (
                    <button
                      styleName='detail-btn'
                      disabled={busy}
                      onClick={() => this.replaceDetail()}
                    >
                      {i18n.__('Replace')}
                    </button>
                  )}
                  {!detail.broken && !detail.isTrash && (
                    <button
                      styleName='detail-btn--danger'
                      disabled={busy}
                      onClick={() => this.deletePaths([detail])}
                    >
                      {i18n.__('Delete')}
                    </button>
                  )}
                  {detail.broken && detail.referencingNotes.length > 0 && (
                    <button
                      styleName='detail-btn--danger'
                      disabled={busy}
                      onClick={() => this.fixBrokenDetail()}
                    >
                      {i18n.__('Fix (remove reference)')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
}

ImageManagerModal.propTypes = {
  // Optional: supplied by openModal, absent when embedded in the Images tab.
  close: PropTypes.func,
  storageList: PropTypes.array.isRequired
}

export default CSSModules(ImageManagerModal, styles)
