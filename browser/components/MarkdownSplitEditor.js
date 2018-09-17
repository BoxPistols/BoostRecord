import React from 'react'
import CodeEditor from 'browser/components/CodeEditor'
import MarkdownPreview from 'browser/components/MarkdownPreview'
import { findStorage } from 'browser/lib/findStorage'
import _ from 'lodash'

import styles from './MarkdownSplitEditor.styl'
import CSSModules from 'browser/lib/CSSModules'

class MarkdownSplitEditor extends React.Component {
  constructor (props) {
    super(props)
    this.value = props.value
    this.focus = () => this.refs.code.focus()
    this.reload = () => this.refs.code.reload()
    this.userScroll = true
    this.state = {
      isSliderFocused: false,
      codeEditorWidthInPercent: 50
    }
  }

  handleCursorActivity (editor) {
    if (this.userScroll) {
      const previewDoc = _.get(this, 'refs.preview.refs.root.contentWindow.document')
      const previewTop = _.get(previewDoc, 'body.scrollTop')

      const line = editor.doc.getCursor().line
      let top
      if (line === 0) {
        top = 0
      } else {
        const blocks = []
        for (const block of previewDoc.querySelectorAll('body>[data-line]')) {
          const l = parseInt(block.getAttribute('data-line'))

          blocks.push({
            line: l,
            top: block.offsetTop
          })

          if (l > line) {
            break
          }
        }

        const i = blocks.length - 1
        if (i > 0) {
          const ratio = (blocks[i].top - blocks[i - 1].top) / (blocks[i].line - blocks[i - 1].line)

          const delta = Math.floor(_.get(previewDoc, 'body.clientHeight') / 3)

          top = blocks[i - 1].top + Math.floor((line - blocks[i - 1].line) * ratio) - delta
        } else {
          const srcTop = _.get(editor.doc, 'scrollTop')
          const srcHeight = _.get(editor.doc, 'height')
          const targetHeight = _.get(previewDoc, 'body.scrollHeight')

          top = targetHeight * srcTop / srcHeight
        }
      }

      this.scrollTo(previewTop, top, y => _.set(previewDoc, 'body.scrollTop', y))
    }
  }

  handleOnChange () {
    this.value = this.refs.code.value
    this.props.onChange()
  }

  handleEditorScroll (e) {
    if (this.userScroll) {
      const previewDoc = _.get(this, 'refs.preview.refs.root.contentWindow.document')
      const codeDoc = _.get(this, 'refs.code.editor.doc')

      const from = codeDoc.cm.coordsChar({left: 0, top: 0}).line
      const to = codeDoc.cm.coordsChar({left: 0, top: codeDoc.cm.display.lastWrapHeight * 1.125}).line
      const previewTop = _.get(previewDoc, 'body.scrollTop')

      let top
      if (from === 0) {
        top = 0
      } else if (to === codeDoc.lastLine()) {
        top = _.get(previewDoc, 'body.scrollHeight') - _.get(previewDoc, 'body.clientHeight')
      } else {
        const line = from + Math.floor((to - from) / 3)

        const blocks = []
        for (const block of previewDoc.querySelectorAll('body>[data-line]')) {
          const l = parseInt(block.getAttribute('data-line'))

          blocks.push({
            line: l,
            top: block.offsetTop
          })

          if (l > line) {
            break
          }
        }

        const i = blocks.length - 1

        const ratio = (blocks[i].top - blocks[i - 1].top) / (blocks[i].line - blocks[i - 1].line)

        top = blocks[i - 1].top + Math.floor((line - blocks[i - 1].line) * ratio)
      }

      this.scrollTo(previewTop, top, y => _.set(previewDoc, 'body.scrollTop', y))
    }
  }

  handlePreviewScroll (e) {
    if (this.userScroll) {
      const previewDoc = _.get(this, 'refs.preview.refs.root.contentWindow.document')
      const codeDoc = _.get(this, 'refs.code.editor.doc')

      const srcTop = _.get(previewDoc, 'body.scrollTop')
      const editorTop = _.get(codeDoc, 'scrollTop')

      let top
      if (srcTop === 0) {
        top = 0
      } else {
        const delta = Math.floor(_.get(previewDoc, 'body.clientHeight') / 3)
        const previewTop = srcTop + delta

        const blocks = []
        for (const block of previewDoc.querySelectorAll('body>[data-line]')) {
          const top = block.offsetTop

          blocks.push({
            line: parseInt(block.getAttribute('data-line')),
            top
          })

          if (top > previewTop) {
            break
          }
        }

        const i = blocks.length - 1
        if (i > 0) {
          const from = codeDoc.cm.heightAtLine(blocks[i - 1].line, 'local')
          const to = codeDoc.cm.heightAtLine(blocks[i].line, 'local')

          const ratio = (previewTop - blocks[i - 1].top) / (blocks[i].top - blocks[i - 1].top)

          top = from + Math.floor((to - from) * ratio) - delta
        } else {
          const srcTop = _.get(previewDoc, 'body.scrollTop')
          const srcHeight = _.get(previewDoc, 'body.scrollHeight')
          const targetHeight = _.get(codeDoc, 'height')

          top = targetHeight * srcTop / srcHeight
        }
      }

      this.scrollTo(editorTop, top, y => codeDoc.cm.scrollTo(0, y))
    }
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

  handleMouseMove (e) {
    if (this.state.isSliderFocused) {
      const rootRect = this.refs.root.getBoundingClientRect()
      const rootWidth = rootRect.width
      const offset = rootRect.left
      let newCodeEditorWidthInPercent = (e.pageX - offset) / rootWidth * 100

      // limit minSize to 10%, maxSize to 90%
      if (newCodeEditorWidthInPercent <= 10) {
        newCodeEditorWidthInPercent = 10
      }

      if (newCodeEditorWidthInPercent >= 90) {
        newCodeEditorWidthInPercent = 90
      }

      this.setState({
        codeEditorWidthInPercent: newCodeEditorWidthInPercent
      })
    }
  }

  handleMouseUp (e) {
    e.preventDefault()
    this.setState({
      isSliderFocused: false
    })
  }

  handleMouseDown (e) {
    e.preventDefault()
    this.setState({
      isSliderFocused: true
    })
  }

  scrollTo (from, to, scroller) {
    const distance = to - from
    const framerate = 1000 / 60
    const frames = 20
    const refractory = frames * framerate

    this.userScroll = false

    let frame = 0
    let scrollPos, time
    const timer = setInterval(() => {
      time = frame / frames
      scrollPos = time < 0.5
                ? 2 * time * time // ease in
                : -1 + (4 - 2 * time) * time // ease out

      scroller(from + scrollPos * distance)

      if (frame >= frames) {
        clearInterval(timer)
        setTimeout(() => { this.userScroll = true }, refractory)
      }
      frame++
    }, framerate)
  }

  render () {
    const {config, value, storageKey, noteKey} = this.props
    const storage = findStorage(storageKey)
    let editorFontSize = parseInt(config.editor.fontSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 101)) editorFontSize = 14
    let editorIndentSize = parseInt(config.editor.indentSize, 10)
    if (!(editorFontSize > 0 && editorFontSize < 132)) editorIndentSize = 4
    const previewStyle = {}
    previewStyle.width = (100 - this.state.codeEditorWidthInPercent) + '%'
    if (this.props.ignorePreviewPointerEvents || this.state.isSliderFocused) previewStyle.pointerEvents = 'none'
    return (
      <div styleName='root' ref='root'
        onMouseMove={e => this.handleMouseMove(e)}
        onMouseUp={e => this.handleMouseUp(e)}>
        <CodeEditor
          styleName='codeEditor'
          ref='code'
          width={this.state.codeEditorWidthInPercent + '%'}
          mode='GitHub Flavored Markdown'
          value={value}
          theme={config.editor.theme}
          keyMap={config.editor.keyMap}
          fontFamily={config.editor.fontFamily}
          fontSize={editorFontSize}
          displayLineNumbers={config.editor.displayLineNumbers}
          indentType={config.editor.indentType}
          indentSize={editorIndentSize}
          enableRulers={config.editor.enableRulers}
          rulers={config.editor.rulers}
          scrollPastEnd={config.editor.scrollPastEnd}
          fetchUrlTitle={config.editor.fetchUrlTitle}
          enableTableEditor={config.editor.enableTableEditor}
          storageKey={storageKey}
          noteKey={noteKey}
          onChange={this.handleOnChange.bind(this)}
          onScroll={this.handleEditorScroll.bind(this)}
          onCursorActivity={this.handleCursorActivity.bind(this)}
       />
        <div styleName='slider' style={{left: this.state.codeEditorWidthInPercent + '%'}} onMouseDown={e => this.handleMouseDown(e)} >
          <div styleName='slider-hitbox' />
        </div>
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
          scrollPastEnd={config.preview.scrollPastEnd}
          smartQuotes={config.preview.smartQuotes}
          smartArrows={config.preview.smartArrows}
          breaks={config.preview.breaks}
          sanitize={config.preview.sanitize}
          ref='preview'
          tabInde='0'
          value={value}
          onCheckboxClick={(e) => this.handleCheckboxClick(e)}
          onScroll={this.handlePreviewScroll.bind(this)}
          showCopyNotification={config.ui.showCopyNotification}
          storagePath={storage.path}
          noteKey={noteKey}
          customCSS={config.preview.customCSS}
          allowCustomCSS={config.preview.allowCustomCSS}
       />
      </div>
    )
  }
}

export default CSSModules(MarkdownSplitEditor, styles)
