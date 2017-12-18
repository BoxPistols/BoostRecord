import React from 'react'
import CodeEditor from 'browser/components/CodeEditor'
import MarkdownPreview from 'browser/components/MarkdownPreview'
import { findStorage } from 'browser/lib/findStorage'

import styles from './MarkdownSplitEditor.styl'
import CSSModules from 'browser/lib/CSSModules'

class MarkdownSplitEditor extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      value: props.value
    }
    this.value = props.value
    this.focus = () => this.refs.code.focus()
    this.reload = () => this.refs.code.reload()
  }

  componentWillReceiveProps (props) {
    this.setState({ value: props.value })
  }

  handleOnChange (e) {
    const value = this.refs.code.value
    this.setState({ value }, () => {
      this.value = value
      this.props.onChange()
    })
  }

  render () {
    const { config, storageKey } = this.props
    const { value } = this.state
    const storage = findStorage(storageKey)
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
          onChange={e => this.handleOnChange(e)}
       />
        <MarkdownPreview
          styleName='preview'
          theme={config.ui.theme}
          keyMap={config.editor.keyMap}
          fontSize={config.preview.fontFamily}
          codeBlockTheme={config.preview.codeBlockTheme}
          codeBlockFontFamily={config.editor.fontFamily}
          lineNumber={config.preview.lineNumber}
          ref='preview'
          tabInde='0'
          value={value}
          showCopyNotification={config.ui.showCopyNotification}
          storagePath={storage.path}
       />
      </div>
    )
  }
}

export default CSSModules(MarkdownSplitEditor, styles)
