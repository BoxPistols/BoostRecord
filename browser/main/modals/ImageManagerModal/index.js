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
      noteLoadFailed: false,
      filter: 'all', // all | unused | broken
      selected: {}, // absPath -> true (bulk)
      detail: null, // the focused attachment
      busy: false,
      notice: null
    }
    this.gridRef = React.createRef()
  }

  componentDidMount() {
    this.load()
  }

  load() {
    this.setState({ loading: true, error: null, selected: {} })
    dataApi
      .listAttachments(this.props.storageList)
      .then(({ attachments, noteLoadFailed }) => {
        attachments.sort(
          (a, b) => Number(b.broken) - Number(a.broken) || b.size - a.size
        )
        this.setState(prev => ({
          attachments,
          noteLoadFailed,
          loading: false,
          detail:
            prev.detail &&
            attachments.find(a => a.absPath === prev.detail.absPath)
              ? attachments.find(a => a.absPath === prev.detail.absPath)
              : null
        }))
      })
      .catch(err => this.setState({ loading: false, error: String(err) }))
  }

  visible() {
    const { attachments, filter } = this.state
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
    const paths = items.filter(a => !a.broken).map(a => a.absPath)
    if (paths.length === 0) {
      this.setState({ notice: i18n.__('Nothing to delete') })
      return
    }
    if (
      !window.confirm(
        i18n.__(
          'Permanently delete the selected image files? This cannot be undone.'
        )
      )
    )
      return
    this.setState({ busy: true, notice: null })
    dataApi
      .deleteAttachmentsVerified(paths)
      .then(({ deleted, failed }) => {
        this.setState({
          busy: false,
          notice:
            i18n.__('Deleted') +
            ': ' +
            deleted.length +
            (failed.length
              ? ' / ' + i18n.__('Failed') + ': ' + failed.length
              : '')
        })
        this.load()
      })
      .catch(err => this.setState({ busy: false, error: String(err) }))
  }

  renameDetail() {
    const a = this.state.detail
    if (!a || a.broken) return
    const dot = a.fileName.lastIndexOf('.')
    const base = dot > 0 ? a.fileName.slice(0, dot) : a.fileName
    const ext = dot > 0 ? a.fileName.slice(dot) : ''
    const input = window.prompt(i18n.__('New file name'), base)
    if (input == null) return
    const newName = input.trim() + (input.trim().endsWith(ext) ? '' : ext)
    if (!newName || newName === a.fileName) return
    const args = {
      storageKey: a.storageKey,
      noteKey: a.noteKey,
      oldName: a.fileName,
      newName
    }
    this.setState({ busy: true, notice: null })
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

    const unused = attachments.filter(a => !a.referenced && !a.broken)
    const broken = attachments.filter(a => a.broken)
    const totalSize = attachments.reduce((s, a) => s + a.size, 0)
    const list = this.visible()
    const selectedItems = attachments.filter(a => selected[a.absPath])

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
            {['all', 'unused', 'broken'].map(f => (
              <button
                key={f}
                styleName={filter === f ? 'tab--active' : 'tab'}
                onClick={() => this.setState({ filter: f })}
              >
                {f === 'all'
                  ? i18n.__('All')
                  : f === 'unused'
                  ? `${i18n.__('Unused')} (${unused.length})`
                  : `${i18n.__('Broken')} (${broken.length})`}
              </button>
            ))}
          </div>
          <div styleName='actions'>
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
          </div>
        </div>

        <div styleName='body'>
          <div styleName='grid' ref={this.gridRef}>
            {loading && <div styleName='empty'>{i18n.__('Scanning…')}</div>}
            {error && <div styleName='empty'>{error}</div>}
            {!loading && !error && list.length === 0 && (
              <div styleName='empty'>{i18n.__('No images')}</div>
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
                  onClick={() => this.setState({ detail: a })}
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
                    {!a.referenced && !a.broken && (
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
                <div styleName='detail-name' title={detail.fileName}>
                  {detail.fileName}
                </div>
                <div styleName='detail-row'>
                  {detail.broken
                    ? i18n.__('Missing file (referenced but not on disk)')
                    : `${humanSize(detail.size)} · ${detail.storageName}`}
                </div>
                <div styleName='detail-refs-title'>
                  {i18n.__('Referenced by')} ({detail.referencingNotes.length})
                </div>
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
                <div styleName='detail-actions'>
                  {!detail.broken && (
                    <button
                      styleName='detail-btn'
                      disabled={busy}
                      onClick={() => this.renameDetail()}
                    >
                      {i18n.__('Rename')}
                    </button>
                  )}
                  {!detail.broken && (
                    <button
                      styleName='detail-btn'
                      disabled={busy}
                      onClick={() => this.replaceDetail()}
                    >
                      {i18n.__('Replace')}
                    </button>
                  )}
                  {!detail.broken && (
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
