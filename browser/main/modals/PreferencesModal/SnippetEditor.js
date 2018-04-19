import CodeMirror from 'codemirror'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import fs from 'fs'
import { findStorage } from 'browser/lib/findStorage'

const defaultEditorFontFamily = ['Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', 'monospace']
const buildCMRulers = (rulers, enableRulers) =>
  enableRulers ? rulers.map(ruler => ({ column: ruler })) : []

export default class SnippetEditor extends React.Component {
  constructor (props) {
    super(props)
  }

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
      autoCloseBrackets: true,
    })
    this.cm.setSize("100%", "100%")
    let snippetId = this.props.snippetId

    const storagePath = findStorage(this.props.storageKey).path
    const expandDataFile = path.join(storagePath, 'expandData.json')
    if (!fs.existsSync(expandDataFile)) {
      const defaultExpandData = [
        {
          matches: ['lorem', 'ipsum'],
          content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
        },
        { match: 'h1', content: '# '},
        { match: 'h2', content: '## '},
        { match: 'h3', content: '### '},
        { match: 'h4', content: '#### '},
        { match: 'h5', content: '##### '},
        { match: 'h6', content: '###### '}
      ];
      fs.writeFileSync(expandDataFile, JSON.stringify(defaultExpandData), 'utf8')
    }
    const expandData = JSON.parse(fs.readFileSync(expandDataFile, 'utf8'))
  }

  componentWillReceiveProps(newProps) {
    this.cm.setValue(newProps.value)
  }

  render () {
    const { fontSize } = this.props
    let fontFamily = this.props.fontFamily
    fontFamily = _.isString(fontFamily) && fontFamily.length > 0
      ? [fontFamily].concat(defaultEditorFontFamily)
      : defaultEditorFontFamily
    return (
      <div 
      styleName="SnippetEditor"
      ref='root'
      tabIndex='-1'
      style={{
        fontFamily: defaultEditorFontFamily.join(', '),
        fontSize: fontSize,
        position: 'relative',
        height: 'calc(100vh - 310px)'
      }}>
      </div>
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
