import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './NewNoteButton.styl'
import _ from 'lodash'
import modal from 'browser/main/lib/modal'
import NewNoteModal from 'browser/main/modals/NewNoteModal'
import eventEmitter from 'browser/main/lib/eventEmitter'
import i18n from 'browser/lib/i18n'
import { createMarkdownNote, createSnippetNote } from 'browser/lib/newNote'
import dataApi from 'browser/main/lib/dataApi'
import queryString from 'query-string'
import { push } from 'connected-react-router'

const remote = require('@electron/remote')
const { dialog } = remote

const OSX = window.process.platform === 'darwin'

class NewNoteButton extends React.Component {
  constructor(props) {
    super(props)

    this.state = {}

    this.handleNewNoteButtonClick = this.handleNewNoteButtonClick.bind(this)
    this.handleExampleNoteClick = this.handleExampleNoteClick.bind(this)
  }

  componentDidMount() {
    eventEmitter.on('top:new-note', this.handleNewNoteButtonClick)
    eventEmitter.on('top:example-note', this.handleExampleNoteClick)
  }

  componentWillUnmount() {
    eventEmitter.off('top:new-note', this.handleNewNoteButtonClick)
    eventEmitter.off('top:example-note', this.handleExampleNoteClick)
  }

  handleNewNoteButtonClick(e) {
    const {
      location,
      dispatch,
      match: { params },
      config
    } = this.props
    const { storage, folder } = this.resolveTargetFolder()
    if (config.ui.defaultNote === 'MARKDOWN_NOTE') {
      createMarkdownNote(
        storage.key,
        folder.key,
        dispatch,
        location,
        params,
        config
      )
    } else if (config.ui.defaultNote === 'SNIPPET_NOTE') {
      createSnippetNote(
        storage.key,
        folder.key,
        dispatch,
        location,
        params,
        config
      )
    } else {
      modal.open(NewNoteModal, {
        storage: storage.key,
        folder: folder.key,
        dispatch,
        location,
        params,
        config
      })
    }
  }

  handleExampleNoteClick() {
    const { dispatch, location, data } = this.props
    const EXAMPLE_TITLE = 'The Boosters — Feature Example'

    // data.noteMap is a MutableMap (browser/lib/Mutable.js), which has no
    // .find(); materialize values first, per the NoteList/Detail convention.
    const existing = data.noteMap
      .map(note => note)
      .find(note => note.title === EXAMPLE_TITLE)
    if (existing) {
      dispatch(
        push({
          pathname: location.pathname,
          search: queryString.stringify({ key: existing.key })
        })
      )
      eventEmitter.emit('list:jump', existing.key)
      return
    }

    const { storage, folder } = this.resolveTargetFolder()
    const content = [
      '# The Boosters — Feature Example',
      '',
      '## YAML Front Matter',
      'Export this note with **File › Export as › .md** and choose',
      '"Merge with the header" to get standard YAML front matter —',
      'compatible with Jekyll, Hugo, Next.js MDX, Obsidian, CLAUDE.md.',
      '',
      '## Mermaid Diagram',
      '',
      '```mermaid',
      'graph TD',
      '  A[Write Notes] --> B[Export as .md]',
      '  B --> C{Format?}',
      '  C -->|YAML header| D[Jekyll / Hugo / Obsidian]',
      '  C -->|Mermaid block| E[GitHub / GitLab / Notion]',
      '  C -->|AI doc| F[CLAUDE.md / Skills.md]',
      '```',
      '',
      '## Code Block',
      '',
      '```js',
      '// Cmd/Ctrl+N → new note  |  Cmd/Ctrl+P → jump to note',
      "const note = { title: 'Example', tags: ['demo', 'mermaid'] }",
      '```',
      '',
      '## Markdown Syntax',
      '',
      '- **Bold**, *italic*, ~~strikethrough~~, `inline code`',
      '- [The Boosters on GitHub](https://github.com/BoxPistols/TheBoosters)',
      '',
      '> Blockquote: export as .md with Mermaid blocks and the diagrams',
      '> render on GitHub, GitLab, Notion, and Obsidian automatically.',
      '',
      '## Keyboard Shortcuts',
      '',
      '| Action | Mac | Windows/Linux |',
      '|--------|-----|---------------|',
      '| New note | ⌘N | Ctrl+N |',
      '| Jump to note | ⌘P | Ctrl+P |',
      '| Export | File › Export as | File › Export as |',
      '| Split view | Mode switcher (toolbar) | Mode switcher (toolbar) |',
      '| Focus note list | ⌘⇧E | Ctrl+Shift+E |',
      '| Example note | Preferences › Export | Preferences › Export |'
    ].join('\n')

    dataApi
      .createNote(storage.key, {
        type: 'MARKDOWN_NOTE',
        folder: folder.key,
        title: EXAMPLE_TITLE,
        tags: ['example', 'mermaid'],
        content,
        linesHighlighted: []
      })
      .then(note => {
        dispatch({ type: 'UPDATE_NOTE', note })
        dispatch(
          push({
            pathname: location.pathname,
            search: queryString.stringify({ key: note.key })
          })
        )
        eventEmitter.emit('list:jump', note.key)
      })
      .catch(err => this.showMessageBox(err.message || String(err)))
  }

  resolveTargetFolder() {
    const {
      data,
      match: { params }
    } = this.props
    let storage = data.storageMap.get(params.storageKey)
    // Find first storage
    if (storage == null) {
      for (const kv of data.storageMap) {
        storage = kv[1]
        break
      }
    }

    if (storage == null)
      this.showMessageBox(i18n.__('No storage to create a note'))
    const folder =
      _.find(storage.folders, { key: params.folderKey }) || storage.folders[0]
    if (folder == null)
      this.showMessageBox(i18n.__('No folder to create a note'))

    return {
      storage,
      folder
    }
  }

  showMessageBox(message) {
    dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      message: message,
      buttons: ['OK']
    })
  }

  render() {
    const { config, style } = this.props
    return (
      <div
        className='NewNoteButton'
        styleName={config.isSideNavFolded ? 'root--expanded' : 'root'}
        style={style}
      >
        <div styleName='control'>
          <button
            styleName='control-newNoteButton'
            onClick={this.handleNewNoteButtonClick}
          >
            <img src='../resources/icon/icon-newnote.svg' />
            <span styleName='control-newNoteButton-tooltip'>
              {i18n.__('Make a note')} {OSX ? '⌘' : i18n.__('Ctrl')} + N
            </span>
          </button>
        </div>
      </div>
    )
  }
}

NewNoteButton.propTypes = {
  dispatch: PropTypes.func,
  config: PropTypes.shape({
    isSideNavFolded: PropTypes.bool
  }),
  data: PropTypes.object,
  location: PropTypes.object,
  match: PropTypes.object
}

export default CSSModules(NewNoteButton, styles)
