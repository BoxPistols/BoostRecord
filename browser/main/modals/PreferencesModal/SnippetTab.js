import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import dataApi from 'browser/main/lib/dataApi'
import styles from './SnippetTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import SnippetEditor from './SnippetEditor';
import i18n from 'browser/lib/i18n'

class SnippetTab extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      snippets: [
        { id: 'abcsajisdjiasd', name: 'Hello' }
      ]
    }
  }

  renderSnippetList () {
    let { snippets } = this.state
    return (
      snippets.map((snippet) => (
        <div styleName='snippet-item' key={snippet.id}>
          {snippet.name}
        </div>
      ))
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
          {this.renderSnippetList()}
        </div>
        <div styleName='snippet-detail'>
          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Snippet name')}</div>
            <div styleName='group-section-control'>
              <input styleName='group-section-control-input' type='text' />
            </div>
          </div>
          <div styleName='snippet-editor-section'>
            <SnippetEditor 
              theme={config.editor.theme}
              keyMap={config.editor.keyMap}
              fontFamily={config.editor.fontFamily}
              fontSize={editorFontSize}
              indentType={config.editor.indentType}
              indentSize={editorIndentSize}
              enableRulers={config.editor.enableRulers}
              rulers={config.editor.rulers}
              displayLineNumbers={config.editor.displayLineNumbers}
              scrollPastEnd={config.editor.scrollPastEnd} />
          </div>
        </div>
      </div>
    )
  }
}

SnippetTab.PropTypes = {
}

export default CSSModules(SnippetTab, styles)