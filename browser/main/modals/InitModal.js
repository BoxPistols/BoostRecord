import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './InitModal.styl'
import dataApi from 'browser/main/lib/dataApi'
import store from 'browser/main/store'
import { hashHistory } from 'react-router'
import _ from 'lodash'
import ModalEscButton from 'browser/components/ModalEscButton'

const CSON = require('@rokt33r/season')
const path = require('path')
const electron = require('electron')
const { remote } = electron

function browseFolder () {
  let dialog = remote.dialog

  let defaultPath = remote.app.getPath('home')
  return new Promise((resolve, reject) => {
    dialog.showOpenDialog({
      title: 'Select Directory',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }, function (targetPaths) {
      if (targetPaths == null) return resolve('')
      resolve(targetPaths[0])
    })
  })
}

class InitModal extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      path: path.join(remote.app.getPath('home'), 'Boostnote'),
      migrationRequested: true,
      isLoading: true,
      data: null,
      legacyStorageExists: false,
      isSending: false
    }
  }

  handlePathChange (e) {
    this.setState({
      path: e.target.value
    })
  }

  componentDidMount () {
    let data = null
    try {
      data = CSON.readFileSync(path.join(remote.app.getPath('userData'), 'local.json'))
    } catch (err) {
      console.error(err)
    }
    let newState = {
      isLoading: false
    }
    if (data != null) {
      newState.legacyStorageExists = true
      newState.data = data
    }
    this.setState(newState, () => {
      this.refs.createButton.focus()
    })
  }

  handlePathBrowseButtonClick (e) {
    browseFolder()
      .then((targetPath) => {
        if (targetPath.length > 0) {
          this.setState({
            path: targetPath
          })
        }
      })
      .catch((err) => {
        console.error('BrowseFAILED')
        console.error(err)
      })
  }

  handleSubmitButtonClick (e) {
    this.setState({
      isSending: true
    }, () => {
      dataApi
        .addStorage({
          name: 'My Storage',
          path: this.state.path
        })
        .then((data) => {
          if (this.state.migrationRequested && _.isObject(this.state.data) && _.isArray(this.state.data.folders) && _.isArray(this.state.data.articles)) {
            return dataApi.migrateFromV5Storage(data.storage.key, this.state.data)
          }
          return data
        })
        .then((data) => {
          if (data.storage.folders[0] != null) {
            return data
          } else {
            return dataApi
              .createFolder(data.storage.key, {
                color: '#1278BD',
                name: 'Default'
              })
              .then((_data) => {
                return {
                  storage: _data.storage,
                  notes: data.notes
                }
              })
          }
        })
        .then((data) => {
          console.log(data)
          store.dispatch({
            type: 'ADD_STORAGE',
            storage: data.storage,
            notes: data.notes
          })

          let defaultSnippetNote = dataApi
            .createNote(data.storage.key, {
              type: 'SNIPPET_NOTE',
              folder: data.storage.folders[0].key,
              title: 'Snippet note example',
              description: 'Snippet note example\nYou can store a series of snippets as a single note, like Gist.',
              snippets: [
                {
                  name: 'example.html',
                  mode: 'html',
                  content: '<html>\n<body>\n<h1 id=\'hello\'>Enjoy Boostnote!</h1>\n</body>\n</html>'
                },
                {
                  name: 'example.js',
                  mode: 'javascript',
                  content: 'var boostnote = document.getElementById(\'enjoy\').innerHTML\n\nconsole.log(boostnote)'
                }
              ]
            })
            .then((note) => {
              store.dispatch({
                type: 'UPDATE_NOTE',
                note: note
              })
            })
          let defaultMarkdownNote = dataApi
            .createNote(data.storage.key, {
              type: 'MARKDOWN_NOTE',
              folder: data.storage.folders[0].key,
              title: 'Markdown Cheat Sheet',
              content: '# <font color="#2AA3EF">Markdown Cheat Sheet / Click here</font>\n# 1. Heading\n## h2\n### h3\nStandard\n\n# 2. Emphasis\n*Italic type*\n**Bold**\n~~Negative~~\n\n# 3. List\n- List 1\n- List 2\n- List 3\n\n# 4. Check box\n- [x] Task 1\n- [ ] Task 2\n\n# 5. Source code\n```js\nRender: function () {\nReturn (\n<Div className = “commentBox”>\n<H1> Comments </ h1>\n<CommentList data = {this.state.data} />\n<CommentForm onCommentSubmit = {this.handleCommentSubmit} />\n</Div>\n);\n}\n```\n\n# 6. Link\n- [Boostnote Repository](https://github.com/BoostIO/Boostnote)\n- [Boostnote Blog](https://medium.com/boostnote)\n\n# 7. Quotation\n> Quotation\n> Quotation Quotation\n\n# 8. Table\n| Fruits | Price |\n|:--|:--|\n| Apple | 1$ |\n| Grapes | 4$ |\n| Orange | 2$ |\n\n# 9. Horizontal line\n* * *\n***\n---\n\n# 10. Image\n![Image title](https://boostnote.io/assets/img/logo.png)\n\n# 11. Fold\n<details><summary>Boostnote is a notepad corresponding to markdown notation, which is a tool for organizing and sharing information.</summary>\n- Features - <br>\n· Search function to find memos in one shot\n· Supports markdown notation <br>\n· Support for Mac, Windows, Linux, iOS, Android <br>\n· Export and import to Plain text (.txt), Markdown (.md) format <br>\n· Supports PDF saving <br>\n· Can be used offline <br>\n· Synchronize to dropbox etc. with setting <br>\n· Supports theme colors and numerous fonts <br>\n</details>\n\n# 12. Latex\n$$$\n\mathrm{e}^{\mathrm{i}\theta} = \cos(\theta) + \mathrm{i}\sin(\theta)\n$$$\n\n# 13. Flowchart\n```flowchart\nst=>start: Start:>http://www.google.com[blank]\ne=>end:>http://www.google.com\nop1=>operation: My Operation\nsub1=>subroutine: My Subroutine\ncond=>condition: Yes or No?:>http://www.google.com\nio=>inputoutput: catch something…\nst->op1->cond\ncond(yes)->io->e\ncond(no)->sub1(right)->op1\n```\n\n# 14. Sequence\n```sequence\nTitle: Here is a title\nA-> B: Normal line\nB -> C: Dashed line\nC -> D: Open arrow\nD -> A: Dashed open arrow\n```\n\n# 15. Ketboard\n<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>i</kbd>'
            })
            .then((note) => {
              store.dispatch({
                type: 'UPDATE_NOTE',
                note: note
              })
            })

          return Promise.resolve(defaultSnippetNote)
            .then(defaultMarkdownNote)
            .then(() => data.storage)
        })
        .then((storage) => {
          hashHistory.push('/storages/' + storage.key)
          this.props.close()
        })
        .catch((err) => {
          this.setState({
            isSending: false
          })
          throw err
        })
    })
  }

  handleMigrationRequestedChange (e) {
    this.setState({
      migrationRequested: e.target.checked
    })
  }

  render () {
    if (this.state.isLoading) {
      return <div styleName='root--loading'>
        <i styleName='spinner' className='fa fa-spin fa-spinner' />
        <div styleName='loadingMessage'>Preparing initialization...</div>
      </div>
    }
    return (
      <div styleName='root'
        tabIndex='-1'
        onKeyDown={this.props.close}
      >

        <div styleName='header'>
          <div styleName='header-title'>Initialize Storage</div>
        </div>
        <ModalEscButton handleEscButtonClick={this.props.close} />
        <div styleName='body'>
          <div styleName='body-welcome'>
            Welcome!
          </div>
          <div styleName='body-description'>
           Please select a directory for Boostnote storage.
          </div>
          <div styleName='body-path'>
            <input styleName='body-path-input'
              placeholder='Select Folder'
              value={this.state.path}
              onChange={(e) => this.handlePathChange(e)}
            />
            <button styleName='body-path-button'
              onClick={(e) => this.handlePathBrowseButtonClick(e)}
            >
              ...
            </button>
          </div>

          {this.state.legacyStorageExists &&
            <div styleName='body-migration'>
              <label><input type='checkbox' checked={this.state.migrationRequested} onChange={(e) => this.handleMigrationRequestedChange(e)} /> Migrate old data from the legacy app v0.5</label>
            </div>
          }

          <div styleName='body-control'>
            <button styleName='body-control-createButton'
              ref='createButton'
              onClick={(e) => this.handleSubmitButtonClick(e)}
              disabled={this.state.isSending}
            >
              {this.state.isSending
                ? <span>
                  <i className='fa fa-spin fa-spinner' /> Loading...
                </span>
                : 'Let\'s Go!'
              }
            </button>
          </div>
        </div>

      </div>
    )
  }
}

InitModal.propTypes = {
}

export default CSSModules(InitModal, styles)
