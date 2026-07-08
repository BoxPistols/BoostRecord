/**
 * @fileoverview Image Manager — a centralized view of every attachment image
 * across all storages, with orphan (unreferenced) detection and bulk delete.
 */
import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ImageManagerModal.styl'
import i18n from 'browser/lib/i18n'
import dataApi from 'browser/main/lib/dataApi'
import fileUrl from 'file-url'

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

class ImageManagerModal extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      loading: true,
      error: null,
      attachments: [],
      noteLoadFailed: false,
      filter: 'all', // 'all' | 'unused'
      selected: {}, // absPath -> true
      busy: false
    }
  }

  componentDidMount() {
    this.load()
  }

  load() {
    this.setState({ loading: true, error: null, selected: {} })
    dataApi
      .listAttachments(this.props.storageList)
      .then(({ attachments, noteLoadFailed }) => {
        // Biggest first — that's what a user cleaning up disk wants to see.
        attachments.sort((a, b) => b.size - a.size)
        this.setState({ attachments, noteLoadFailed, loading: false })
      })
      .catch(err => {
        this.setState({ loading: false, error: String(err) })
      })
  }

  visibleAttachments() {
    const { attachments, filter } = this.state
    return filter === 'unused'
      ? attachments.filter(a => !a.referenced)
      : attachments
  }

  toggleSelect(absPath) {
    const selected = Object.assign({}, this.state.selected)
    if (selected[absPath]) delete selected[absPath]
    else selected[absPath] = true
    this.setState({ selected })
  }

  selectedPaths() {
    return Object.keys(this.state.selected)
  }

  deletePaths(paths) {
    if (paths.length === 0) return
    const ok = window.confirm(
      i18n.__('Delete the selected image files? This cannot be undone.')
    )
    if (!ok) return
    this.setState({ busy: true })
    dataApi
      .removeAttachmentsByPaths(paths)
      .then(() => this.load())
      .then(() => this.setState({ busy: false }))
      .catch(err => this.setState({ busy: false, error: String(err) }))
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
      busy
    } = this.state

    const unused = attachments.filter(a => !a.referenced)
    const totalSize = attachments.reduce((s, a) => s + a.size, 0)
    const unusedSize = unused.reduce((s, a) => s + a.size, 0)
    const visible = this.visibleAttachments()
    const selectedCount = this.selectedPaths().length

    return (
      <div styleName='root'>
        <div styleName='header'>
          <div styleName='title'>{i18n.__('Image Manager')}</div>
          <button styleName='close' onClick={() => close()}>
            ×
          </button>
        </div>

        <div styleName='summary'>
          {loading
            ? i18n.__('Scanning…')
            : `${attachments.length} ${i18n.__('images')} · ${humanSize(
                totalSize
              )} · ${unused.length} ${i18n.__('unused')} (${humanSize(
                unusedSize
              )})`}
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
            <button
              styleName={filter === 'all' ? 'tab--active' : 'tab'}
              onClick={() => this.setState({ filter: 'all' })}
            >
              {i18n.__('All')}
            </button>
            <button
              styleName={filter === 'unused' ? 'tab--active' : 'tab'}
              onClick={() => this.setState({ filter: 'unused' })}
            >
              {i18n.__('Unused')} ({unused.length})
            </button>
          </div>
          <div styleName='actions'>
            <button
              styleName='action'
              disabled={busy || selectedCount === 0}
              onClick={() => this.deletePaths(this.selectedPaths())}
            >
              {i18n.__('Delete selected')} ({selectedCount})
            </button>
            <button
              styleName='action--danger'
              disabled={busy || noteLoadFailed || unused.length === 0}
              title={
                noteLoadFailed
                  ? i18n.__('Disabled: some notes could not be read')
                  : ''
              }
              onClick={() => this.deletePaths(unused.map(a => a.absPath))}
            >
              {i18n.__('Delete all unused')}
            </button>
          </div>
        </div>

        <div styleName='grid'>
          {loading && <div styleName='empty'>{i18n.__('Scanning…')}</div>}
          {error && <div styleName='empty'>{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div styleName='empty'>{i18n.__('No images')}</div>
          )}
          {!loading &&
            visible.map(a => (
              <div
                key={a.absPath}
                styleName={selected[a.absPath] ? 'card--selected' : 'card'}
                onClick={() => this.toggleSelect(a.absPath)}
              >
                <div styleName='thumb'>
                  <img src={fileUrl(a.absPath)} loading='lazy' />
                  {!a.referenced && (
                    <span styleName='badge-unused'>{i18n.__('Unused')}</span>
                  )}
                </div>
                <div styleName='meta'>
                  <div styleName='filename' title={a.fileName}>
                    {a.fileName}
                  </div>
                  <div styleName='sub'>
                    {humanSize(a.size)} ·{' '}
                    {a.referenced
                      ? a.noteTitle || i18n.__('(untitled note)')
                      : a.storageName}
                  </div>
                </div>
                <input
                  type='checkbox'
                  styleName='check'
                  checked={!!selected[a.absPath]}
                  readOnly
                />
              </div>
            ))}
        </div>
      </div>
    )
  }
}

ImageManagerModal.propTypes = {
  close: PropTypes.func.isRequired,
  storageList: PropTypes.array.isRequired
}

export default CSSModules(ImageManagerModal, styles)
