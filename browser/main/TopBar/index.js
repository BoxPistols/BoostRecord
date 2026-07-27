import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './TopBar.styl'
import _ from 'lodash'
import ee from 'browser/main/lib/eventEmitter'
import NewNoteButton from 'browser/main/NewNoteButton'
import i18n from 'browser/lib/i18n'
import debounce from 'lodash/debounce'
import CInput from 'react-composition-input'
import { push } from 'connected-react-router'

// ショートカット表記の OS 出し分け（キー名はハードコードしない）
const isMac = /Mac|iPhone|iPad|iPod/.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

class TopBar extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      search: '',
      searchOptions: [],
      isSearching: false
    }

    const { dispatch } = this.props

    this.focusSearchHandler = () => {
      this.handleOnSearchFocus()
    }

    this.codeInitHandler = this.handleCodeInit.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleSearchFocus = this.handleSearchFocus.bind(this)
    this.handleSearchBlur = this.handleSearchBlur.bind(this)
    this.handleSearchChange = this.handleSearchChange.bind(this)
    this.handleSearchClearButton = this.handleSearchClearButton.bind(this)

    this.debouncedUpdateKeyword = debounce(
      keyword => {
        dispatch(push(`/searched/${encodeURIComponent(keyword)}`))
        this.setState({
          search: keyword
        })
        ee.emit('top:search', keyword)
      },
      1000 / 60,
      {
        maxWait: 1000 / 8
      }
    )
  }

  componentDidMount() {
    const {
      match: { params }
    } = this.props
    const searchWord = params && params.searchword
    if (searchWord !== undefined) {
      this.setState({
        search: searchWord,
        isSearching: true
      })
    }
    ee.on('top:focus-search', this.focusSearchHandler)
    ee.on('code:init', this.codeInitHandler)
  }

  componentWillUnmount() {
    ee.off('top:focus-search', this.focusSearchHandler)
    ee.off('code:init', this.codeInitHandler)
  }

  handleSearchClearButton(e) {
    const { dispatch } = this.props
    this.setState({
      search: '',
      isSearching: false
    })
    this.refs.search.childNodes[0].blur()
    dispatch(push('/searched'))
    e.preventDefault()
    this.debouncedUpdateKeyword('')
  }

  handleKeyDown(e) {
    // Re-apply search field on ENTER key
    if (e.keyCode === 13) {
      this.debouncedUpdateKeyword(e.target.value)
    }

    // Clear search on ESC
    if (e.keyCode === 27) {
      return this.handleSearchClearButton(e)
    }

    // Next note on DOWN key
    if (e.keyCode === 40) {
      ee.emit('list:next')
      e.preventDefault()
    }

    // Prev note on UP key
    if (e.keyCode === 38) {
      ee.emit('list:prior')
      e.preventDefault()
    }
  }

  handleSearchChange(e) {
    const keyword = e.target.value
    this.debouncedUpdateKeyword(keyword)
  }

  handleSearchFocus(e) {
    this.setState({
      isSearching: true
    })
  }

  handleSearchBlur(e) {
    e.stopPropagation()

    let el = e.relatedTarget
    let isStillFocused = false
    while (el != null) {
      if (el === this.refs.search) {
        isStillFocused = true
        break
      }
      el = el.parentNode
    }
    if (!isStillFocused) {
      this.setState({
        isSearching: false
      })
    }
  }

  handleOnSearchFocus() {
    const el = this.refs.search.childNodes[0]
    if (this.state.isSearching) {
      el.blur()
    } else {
      el.select()
    }
  }

  handleCodeInit() {
    ee.emit('top:search', this.refs.searchInput.value || '')
  }

  render() {
    const { config, style, location, onToggleNoteList } = this.props
    return (
      <div
        className='TopBar'
        styleName={config.isSideNavFolded ? 'root--expanded' : 'root'}
        style={style}
      >
        <div styleName='control'>
          {/* ノート一覧ペインの折りたたみ。サイドバー左下の « と対になる位置 */}
          {onToggleNoteList && (
            <button
              styleName='control-fold'
              title={`${i18n.__('Toggle Note List')} (${
                isMac ? '⌘⇧B' : 'Ctrl+Shift+B'
              })`}
              aria-label={i18n.__('Toggle Note List')}
              onClick={onToggleNoteList}
            >
              <i className='fa fa-angle-double-left' />
            </button>
          )}
          <div styleName='control-search'>
            <div
              styleName='control-search-input'
              onFocus={this.handleSearchFocus}
              onBlur={this.handleSearchBlur}
              tabIndex='-1'
              ref='search'
            >
              <CInput
                ref='searchInput'
                value={this.state.search}
                onInputChange={this.handleSearchChange}
                onKeyDown={this.handleKeyDown}
                placeholder={i18n.__('Search')}
                type='text'
                className='searchInput'
              />
              {this.state.search !== '' && (
                <button
                  styleName='control-search-input-clear'
                  onClick={this.handleSearchClearButton}
                >
                  <i className='fa fa-fw fa-times' />
                  <span styleName='control-search-input-clear-tooltip'>
                    {i18n.__('Clear Search')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        {location.pathname === '/trashed' ? (
          ''
        ) : (
          <NewNoteButton
            {..._.pick(this.props, [
              'dispatch',
              'data',
              'config',
              'location',
              'match'
            ])}
          />
        )}
      </div>
    )
  }
}

TopBar.contextTypes = {
  router: PropTypes.shape({
    push: PropTypes.func
  })
}

TopBar.propTypes = {
  dispatch: PropTypes.func,
  config: PropTypes.shape({
    isSideNavFolded: PropTypes.bool
  }),
  // 省略時は折りたたみボタンを出さない（TopBar は Main 以外からも描画される）
  onToggleNoteList: PropTypes.func
}

export default CSSModules(TopBar, styles)
