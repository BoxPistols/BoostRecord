import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SnippetTab.styl'
import fs from 'fs'
import SnippetEditor from './SnippetEditor'
import i18n from 'browser/lib/i18n'
import dataApi from 'browser/main/lib/dataApi'
import consts from 'browser/lib/consts'

const { remote } = require('electron')

const { Menu, MenuItem } = remote

class SnippetTab extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      snippets: [],
      currentSnippet: null
    }
  }

  componentDidMount () {
    this.snippets = JSON.parse(fs.readFileSync(consts.SNIPPET_FILE, 'utf8'))

    this.setState({snippets: this.snippets})
  }

  handleSnippetClick (snippet) {
    const currentSnippet = Object.assign({}, snippet)
    currentSnippet.prefix = currentSnippet.prefix.join(', ')
    this.setState({currentSnippet})
  }

  handleSnippetContextMenu (snippet) {
    const menu = new Menu()
    menu.append(new MenuItem({
      label: 'Delete',
      click: () => {
        this.deleteSnippet(snippet.id)
      }
    }))
    menu.popup()
  }

  deleteSnippet (id) {
    dataApi.deleteSnippet(this.snippets, id).then((snippets) => {
      this.snippets = snippets
      this.setState(this.snippets)
    }).catch(err => { throw err })
  }

  createSnippet () {
    dataApi.createSnippet(this.snippets).then((snippets) => {
      this.snippets = snippets
      this.setState(this.snippets)
      // scroll to end of list when added new snippet
      const snippetList = document.getElementById('snippets')
      snippetList.scrollTop = snippetList.scrollHeight
    }).catch(err => { throw err })
  }

  renderSnippetList () {
    const { snippets } = this.state
    return (
      <ul id='snippets' style={{height: 'calc(100% - 8px)', overflow: 'scroll', background: '#f5f5f5'}}>
        {
          snippets.map((snippet) => (
            <li
              styleName='snippet-item'
              key={snippet.id}
              onContextMenu={() => this.handleSnippetContextMenu(snippet)}
              onClick={() => this.handleSnippetClick(snippet)}>
              {snippet.name}
            </li>
          ))
        }
      </ul>
    )
  }

  render () {
    const { config } = this.props

    let editorFontSize = parseInt(config.editor.fontSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 101)) editorFontSize = 14
    let editorIndentSize = parseInt(config.editor.indentSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 132)) editorIndentSize = 4
    return (
      <div styleName='root'>
        <div styleName='header'>{i18n.__('Snippets')}</div>
        <div styleName='snippet-list'>
          <div styleName='group-section'>
            <div styleName='group-section-control'>
              <button styleName='group-control-button' onClick={() => this.createSnippet()}>
                <i className='fa fa-plus' /> {i18n.__('New Snippet')}
              </button>
            </div>
          </div>
          {this.renderSnippetList()}
        </div>
        {this.state.currentSnippet ? <div styleName='snippet-detail'>
          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Snippet name')}</div>
            <div styleName='group-section-control'>
              <input
                styleName='group-section-control-input'
                value={this.state.currentSnippet.name}
                onChange={e => {
                  const newSnippet = Object.assign({}, this.state.currentSnippet)
                  newSnippet.name = e.target.value
                  this.setState({ currentSnippet: newSnippet })
                }}
                type='text' />
            </div>
          </div>
          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Snippet prefix')}</div>
            <div styleName='group-section-control'>
              <input
                styleName='group-section-control-input'
                value={this.state.currentSnippet.prefix}
                onChange={e => {
                  const newSnippet = Object.assign({}, this.state.currentSnippet)
                  newSnippet.prefix = e.target.value
                  this.setState({ currentSnippet: newSnippet })
                }}
                type='text' />
            </div>
          </div>
          <div styleName='snippet-editor-section'>
            <SnippetEditor
              storageKey={this.props.storageKey}
              theme={config.editor.theme}
              keyMap={config.editor.keyMap}
              fontFamily={config.editor.fontFamily}
              fontSize={editorFontSize}
              indentType={config.editor.indentType}
              indentSize={editorIndentSize}
              enableRulers={config.editor.enableRulers}
              rulers={config.editor.rulers}
              displayLineNumbers={config.editor.displayLineNumbers}
              scrollPastEnd={config.editor.scrollPastEnd}
              snippet={this.state.currentSnippet} />
          </div>
        </div>
        : ''}
      </div>
    )
  }
}

SnippetTab.PropTypes = {
}

export default CSSModules(SnippetTab, styles)
