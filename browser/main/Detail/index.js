import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './Detail.styl'
import _ from 'lodash'
import MarkdownNoteDetail from './MarkdownNoteDetail'
import SnippetNoteDetail from './SnippetNoteDetail'
import ee from 'browser/main/lib/eventEmitter'
import StatusBar from '../StatusBar'
import i18n from 'browser/lib/i18n'
import debounceRender from 'react-debounce-render'

const OSX = global.process.platform === 'darwin'

class Detail extends React.Component {
  constructor (props) {
    super(props)

    this.focusHandler = () => {
      this.refs.root != null && this.refs.root.focus()
    }
    this.deleteHandler = () => {
      this.refs.root != null && this.refs.root.handleTrashButtonClick()
    }
  }

  componentDidMount () {
    ee.on('detail:focus', this.focusHandler)
    ee.on('detail:delete', this.deleteHandler)
  }

  componentWillUnmount () {
    ee.off('detail:focus', this.focusHandler)
    ee.off('detail:delete', this.deleteHandler)
  }

  render () {
    const { location, data, config } = this.props
    let note = null
    if (location.query.key != null) {
      const noteKey = location.query.key
      note = data.noteMap.get(noteKey)
    }

    if (note == null) {
      return (
        <div styleName='root'
          style={this.props.style}
          tabIndex='0'
        >
          <div styleName='empty'>
            <div styleName='empty-message'>{OSX ? i18n.__('Command(⌘)') : i18n.__('Ctrl(^)')} + N<br />{i18n.__('to create a new note')}</div>
          </div>
          <StatusBar
            {..._.pick(this.props, ['config', 'location', 'dispatch'])}
          />
        </div>
      )
    }

    if (note.type === 'SNIPPET_NOTE') {
      return (
        <SnippetNoteDetail
          note={note}
          config={config}
          ref='root'
          {..._.pick(this.props, [
            'dispatch',
            'data',
            'style',
            'ignorePreviewPointerEvents',
            'location'
          ])}
        />
      )
    }

    return (
      <MarkdownNoteDetail
        note={note}
        config={config}
        ref='root'
        {..._.pick(this.props, [
          'dispatch',
          'data',
          'style',
          'ignorePreviewPointerEvents',
          'location'
        ])}
      />
    )
  }
}

Detail.propTypes = {
  dispatch: PropTypes.func,
  style: PropTypes.shape({
    left: PropTypes.number
  }),
  ignorePreviewPointerEvents: PropTypes.bool
}

export default debounceRender(CSSModules(Detail, styles))
