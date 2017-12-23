import React from 'react'
import CodeEditor from 'browser/components/CodeEditor'
import MarkdownPreview from 'browser/components/MarkdownPreview'
import { findStorage } from 'browser/lib/findStorage'

import styles from './MarkdownSplitEditor.styl'
import CSSModules from 'browser/lib/CSSModules'

class MarkdownSplitEditor extends React.Component {
  constructor (props) {
    super(props)
    this.value = props.value
    this.focus = () => this.refs.code.focus()
    this.reload = () => this.refs.code.reload()
  }

  handleOnChange () {
    this.value = this.refs.code.value
    this.props.onChange()
  }

  handleCheckboxClick (e) {
    e.preventDefault()
    e.stopPropagation()
    const idMatch = /checkbox-([0-9]+)/
    const checkedMatch = /\[x\]/i
    const uncheckedMatch = /\[ \]/
    if (idMatch.test(e.target.getAttribute('id'))) {
      const lineIndex = parseInt(e.target.getAttribute('id').match(idMatch)[1], 10) - 1
      const lines = this.refs.code.value
        .split('\n')

      const targetLine = lines[lineIndex]

      if (targetLine.match(checkedMatch)) {
        lines[lineIndex] = targetLine.replace(checkedMatch, '[ ]')
      }
      if (targetLine.match(uncheckedMatch)) {
        lines[lineIndex] = targetLine.replace(uncheckedMatch, '[x]')
      }
      this.refs.code.setValue(lines.join('\n'))
    }
  }

  render () {
    const { config, value, storageKey } = this.props
    const storage = findStorage(storageKey)
    const previewStyle = {}
    if (this.props.ignorePreviewPointerEvents) previewStyle.pointerEvents = 'none'
    return (
      <div styleName='root'>
        <CodeEditor
          styleName='codeEditor'
          ref='code'
          mode='GitHub Flavored Markdown'
          value={value}
          theme={config.editor.theme}
          keyMap={config.editor.keyMap}
          fontFamily={config.editor.fontFamily}
          indentType={config.editor.indentType}
          scrollPastEnd={config.editor.scrollPastEnd}
          storageKey={storageKey}
          onChange={this.handleOnChange.bind(this)}
       />
        <MarkdownPreview
          style={previewStyle}
          styleName='preview'
          theme={config.ui.theme}
          keyMap={config.editor.keyMap}
          fontSize={config.preview.fontSize}
          fontFamily={config.preview.fontFamily}
          codeBlockTheme={config.preview.codeBlockTheme}
          codeBlockFontFamily={config.editor.fontFamily}
          lineNumber={config.preview.lineNumber}
          ref='preview'
          tabInde='0'
          value={value}
          onCheckboxClick={(e) => this.handleCheckboxClick(e)}
          showCopyNotification={config.ui.showCopyNotification}
          storagePath={storage.path}
       />
      </div>
    )
  }
}

export default CSSModules(MarkdownSplitEditor, styles)
