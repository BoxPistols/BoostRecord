import CodeMirror from 'codemirror'
import React from 'react'
import _ from 'lodash'
import fs from 'fs'
import consts from 'browser/lib/consts'
import dataApi from 'browser/main/lib/dataApi'

const defaultEditorFontFamily = ['Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', 'monospace']
const buildCMRulers = (rulers, enableRulers) =>
  enableRulers ? rulers.map(ruler => ({ column: ruler })) : []

export default class SnippetEditor extends React.Component {

  componentDidMount () {
    const { rulers, enableRulers } = this.props
    this.cm = CodeMirror(this.refs.root, {
      rulers: buildCMRulers(rulers, enableRulers),
      lineNumbers: this.props.displayLineNumbers,
      lineWrapping: true,
      theme: this.props.theme,
      indentUnit: this.props.indentSize,
      tabSize: this.props.indentSize,
      indentWithTabs: this.props.indentType !== 'space',
      keyMap: this.props.keyMap,
      scrollPastEnd: this.props.scrollPastEnd,
      dragDrop: false,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      autoCloseBrackets: true
    })
    this.cm.setSize('100%', '100%')
    this.snippet = this.props.snippet
    const snippetId = this.snippet.id
    this.loadSnippet(snippetId)
    let changeDelay = null

    this.cm.on('change', () => {
      this.snippet.content = this.cm.getValue()

      clearTimeout(changeDelay)
      changeDelay = setTimeout(() => {
        this.saveSnippet()
      }, 500)
    })
  }

  saveSnippet () {
    dataApi.updateSnippet(this.snippet).catch((err) => { throw err })
  }

  loadSnippet (snippetId) {
    const snippets = JSON.parse(fs.readFileSync(consts.SNIPPET_FILE, 'utf8'))

    for (let i = 0; i < snippets.length; i++) {
      if (snippets[i].id === snippetId) {
        this.cm.setValue(snippets[i].content)
      }
    }
  }

  componentWillReceiveProps (newProps) {
    if (this.snippet.id !== newProps.snippet.id) {
      // when user changed to a new snippet on the snippetList.js
      this.loadSnippet(newProps.snippet.id)
    } else {
      // when snippet name or prefix being changed from snippetTab.js
      this.snippet.name = newProps.snippet.name
      this.snippet.prefix = newProps.snippet.prefix.replace(/\s/g, '').split(/\,/).filter(val => val)
      this.saveSnippet()
    }
  }

  render () {
    const { fontSize } = this.props
    let fontFamily = this.props.fontFamily
    fontFamily = _.isString(fontFamily) && fontFamily.length > 0
      ? [fontFamily].concat(defaultEditorFontFamily)
      : defaultEditorFontFamily
    return (
      <div styleName='SnippetEditor' ref='root' tabIndex='-1' style={{
        fontFamily: fontFamily.join(', '),
        fontSize: fontSize,
        position: 'absolute',
        width: '100%',
        height: '90%'
      }} />
    )
  }
}

SnippetEditor.defaultProps = {
  readOnly: false,
  theme: 'xcode',
  keyMap: 'sublime',
  fontSize: 14,
  fontFamily: 'Monaco, Consolas',
  indentSize: 4,
  indentType: 'space'
}
