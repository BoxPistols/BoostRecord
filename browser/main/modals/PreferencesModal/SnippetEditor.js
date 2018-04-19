import CodeMirror from 'codemirror'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultEditorFontFamily = ['Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', 'monospace']
const buildCMRulers = (rulers, enableRulers) =>
  enableRulers ? rulers.map(ruler => ({ column: ruler })) : []

export default class SnippetEditor extends React.Component {
  constructor (props) {
    super(props)
  }

  componentDidMount () {
    const { rulers, enableRulers } = this.props
    let cm = CodeMirror(this.refs.root, {
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
    cm.setValue("asdasd")
    cm.setSize("100%", "100%")
  }

  render() {
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
