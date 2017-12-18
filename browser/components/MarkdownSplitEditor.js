import React from 'react'

import styles from './MarkdownSplitEditor.styl'
import CSSModules from 'browser/lib/CSSModules'

class MarkdownSplitEditor extends React.Component {
  render () {
    return (
      <div styleName='root'>
        <div styleName='editor'>
          <p>editor</p>
        </div>
        <div styleName='preview'>
          <p>preview</p>
        </div>
      </div>
    )
  }
}

export default CSSModules(MarkdownSplitEditor, styles)
