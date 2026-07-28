import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './Main.styl'
import { connect } from 'react-redux'
import SideNav from './SideNav'
import TopBar from './TopBar'
import NoteList from './NoteList'
import Detail from './Detail'
import dataApi from 'browser/main/lib/dataApi'
import _ from 'lodash'
import ConfigManager from 'browser/main/lib/ConfigManager'
import mobileAnalytics from 'browser/main/lib/AwsMobileAnalyticsConfig'
import eventEmitter from 'browser/main/lib/eventEmitter'
import { store } from 'browser/main/store'
import i18n from 'browser/lib/i18n'
import { getLocales } from 'browser/lib/Languages'
import applyShortcuts from 'browser/main/lib/shortcutManager'
import { chooseTheme, applyTheme } from 'browser/main/lib/ThemeManager'
import { push } from 'connected-react-router'
import { ipcRenderer } from 'electron'

const path = require('path')
const electron = require('electron')
const remote = require('@electron/remote')

// ノート一覧ペインのドラッグ下限。180px では「もう少し狭く」の要望を満たせず、
// これ以上狭めるとタイトルが読めなくなるため 120px を下限にする
const MIN_LIST_WIDTH = 120

// 折りたたみ時に残す幅。完全に 0 にすると何のペインだったか分からなくなるので、
// サイドバー（44px でアイコンだけ残る）と同じ考え方でタイトルの先頭数文字を残す
const FOLDED_LIST_WIDTH = 56

// ショートカット表記の OS 出し分け（キー名はハードコードしない）
const isMac = /Mac|iPhone|iPad|iPod/.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

class Main extends React.Component {
  constructor(props) {
    super(props)

    if (process.env.NODE_ENV === 'production') {
      mobileAnalytics.initAwsMobileAnalytics()
    }

    const { config } = props

    this.state = {
      isRightSliderFocused: false,
      listWidth: config.listWidth,
      navWidth: config.navWidth,
      isLeftSliderFocused: false,
      fullScreen: false,
      noteDetailWidth: 0,
      mainBodyWidth: 0,
      isLoading: true
    }

    this.toggleFullScreen = () => this.handleFullScreenButton()
    // IPC は引数を伴うので、それを捨てるラッパーで受ける
    this.toggleNoteListHandler = () => this.toggleNoteList()
    this.paneTabHandler = e => this.handlePaneTab(e)
  }

  /**
   * Tab でサイドバー → ノート一覧、Shift+Tab で逆へ移す。
   *
   * 当初は各ボタンの onKeyDown に置いていたが、macOS はボタンをクリックしても
   * フォーカスが入らない（システム設定「フルキーボードアクセス」が既定オフ）。
   * クリック時に focus() を差し込む方法も試したが、再描画と競合して入る時と
   * 入らない時があった。現在フォーカスがどこにあるかに依存せず、window で
   * 受けて行き先を決める方式にしている。
   */
  handlePaneTab(e) {
    if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return

    // 文字入力中の Tab は本来の意味（インデント・次項目）を保つ
    const el = document.activeElement
    if (el) {
      const tag = el.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable ||
        el.closest('.CodeMirror')
      ) {
        return
      }
    }
    // モーダル表示中は中のフォーカス移動を邪魔しない
    if (document.body.getAttribute('data-modal') === 'open') return

    const noteList = document.querySelector('[data-note-list]')
    const sideNav = document.querySelector('.SideNav')

    // 非表示の要素に focus() しても何も起きず、Tab を握り潰しただけになる。
    // 畳まれたペインや隠れたフォルダを行き先にしないよう可視判定を挟む
    const isVisible = el => !!el && el.offsetParent !== null

    if (e.shiftKey) {
      // ノート一覧 → サイドバー。選択中フォルダが見えていればそこへ、
      // 無ければサイドバー自体へ（tabIndex を持つのでフォーカスできる）
      const activeFolder = document.querySelector('.SideNav-active-folder')
      const target = isVisible(activeFolder) ? activeFolder : sideNav
      if (!isVisible(target)) return
      e.preventDefault()
      target.focus()
      return
    }

    if (!isVisible(noteList)) return
    e.preventDefault()
    noteList.focus()
  }

  toggleNoteList() {
    // フルスクリーン中は hideLeftLists が DOM を直接触って一覧を隠しており、
    // ここで再描画すると React が display を戻して一覧が復活してしまう。
    // フルスクリーンでは一覧はそもそも見えないので、操作自体を無視する
    if (this.state.fullScreen) return
    const { dispatch, config } = this.props
    const isFolded = !config.isNoteListFolded
    ConfigManager.set({ isNoteListFolded: isFolded })
    dispatch({ type: 'SET_IS_NOTELIST_FOLDED', isFolded })
  }

  getChildContext() {
    const { status, config } = this.props

    return {
      status,
      config
    }
  }

  init() {
    dataApi
      .addStorage({
        name: 'My Storage Location',
        path: path.join(remote.app.getPath('home'), 'Boostnote')
      })
      .then(data => {
        return data
      })
      .then(data => {
        if (data.storage.folders[0] != null) {
          return data
        } else {
          return dataApi
            .createFolder(data.storage.key, {
              color: '#1278BD',
              name: 'Default'
            })
            .then(_data => {
              return {
                storage: _data.storage,
                notes: data.notes
              }
            })
        }
      })
      .then(data => {
        store.dispatch({
          type: 'ADD_STORAGE',
          storage: data.storage,
          notes: data.notes
        })

        const defaultSnippetNote = dataApi
          .createNote(data.storage.key, {
            type: 'SNIPPET_NOTE',
            folder: data.storage.folders[0].key,
            title: 'Snippet note example',
            description:
              'Snippet note example\nYou can store a series of snippets as a single note, like Gist.',
            snippets: [
              {
                name: 'example.html',
                mode: 'html',
                content:
                  "<html>\n<body>\n<h1 id='hello'>Enjoy The Boosters!</h1>\n</body>\n</html>",
                linesHighlighted: []
              },
              {
                name: 'example.js',
                mode: 'javascript',
                content:
                  "var message = document.getElementById('hello').innerHTML\n\nconsole.log(message)",
                linesHighlighted: []
              }
            ]
          })
          .then(note => {
            store.dispatch({
              type: 'UPDATE_NOTE',
              note: note
            })
          })
        const defaultMarkdownNote = dataApi
          .createNote(data.storage.key, {
            type: 'MARKDOWN_NOTE',
            folder: data.storage.folders[0].key,
            title: 'Welcome to The Boosters!',
            content:
              '# Welcome to The Boosters! :guitar:\n## Click here to edit markdown :wave:\n\nThe Boosters is a local-first note-taking app for programmers.\n\n## Quick start :memo:\n- Press `Cmd/Ctrl + N` to create a new note\n- Press `Cmd/Ctrl + P` to jump to any note\n- Link notes with `[Title](:note:<note-key>)` — copy a note link from the note list context menu\n- Store code as **Snippet notes**, prose as **Markdown notes**\n\n## Docs :books:\n- [GitHub (BoxPistols/TheBoosters)](https://github.com/BoxPistols/TheBoosters)\n- [Cloud syncing via OneDrive](https://github.com/BoxPistols/TheBoosters/blob/main/docs/ONEDRIVE-DESKTOP-SETUP.md)'
          })
          .then(note => {
            store.dispatch({
              type: 'UPDATE_NOTE',
              note: note
            })
          })

        return Promise.resolve(defaultSnippetNote)
          .then(defaultMarkdownNote)
          .then(() => data.storage)
      })
      .then(storage => {
        store.dispatch(push('/storages/' + storage.key))
      })
      .catch(err => {
        throw err
      })
  }

  componentDidMount() {
    const { dispatch, config } = this.props

    this.refreshTheme = setInterval(() => {
      const conf = ConfigManager.get()
      chooseTheme(conf)
    }, 5 * 1000)

    chooseTheme(config)
    applyTheme(config.ui.theme)

    if (getLocales().indexOf(config.ui.language) !== -1) {
      i18n.setLocale(config.ui.language)
    } else {
      i18n.setLocale('en')
    }
    applyShortcuts()
    // Reload all data
    dataApi.init().then(data => {
      dispatch({
        type: 'INIT_ALL',
        storages: data.storages,
        notes: data.notes
      })
      this.setState({ isLoading: false })

      if (data.storages.length < 1) {
        this.init()
      }
    })

    // eslint-disable-next-line no-undef
    delete CodeMirror.keyMap.emacs['Ctrl-V']

    eventEmitter.on('editor:fullscreen', this.toggleFullScreen)
    ipcRenderer.on('editor:fullscreen', this.toggleFullScreen)
    eventEmitter.on(
      'menubar:togglemenubar',
      this.toggleMenuBarVisible.bind(this)
    )
    eventEmitter.on('dispatch:push', this.changeRoutePush.bind(this))
    eventEmitter.on('update', () => ipcRenderer.send('update-check', 'manual'))
    // View メニュー "Toggle Note List"（Cmd/Ctrl+Shift+B）
    eventEmitter.on('sidenav:togglenotelist', this.toggleNoteListHandler)
    window.addEventListener('keydown', this.paneTabHandler)
  }

  componentWillUnmount() {
    eventEmitter.off('editor:fullscreen', this.toggleFullScreen)
    ipcRenderer.removeListener('editor:fullscreen', this.toggleFullScreen)
    eventEmitter.off(
      'menubar:togglemenubar',
      this.toggleMenuBarVisible.bind(this)
    )
    eventEmitter.off('dispatch:push', this.changeRoutePush.bind(this))
    eventEmitter.off('sidenav:togglenotelist', this.toggleNoteListHandler)
    window.removeEventListener('keydown', this.paneTabHandler)
    clearInterval(this.refreshTheme)
  }

  changeRoutePush(event, destination) {
    const { dispatch } = this.props
    dispatch(push(destination))
  }

  toggleMenuBarVisible() {
    const { config } = this.props
    const { ui } = config

    const newUI = Object.assign(ui, { showMenuBar: !ui.showMenuBar })
    const newConfig = Object.assign(config, newUI)
    ConfigManager.set(newConfig)
  }

  handleLeftSlideMouseDown(e) {
    e.preventDefault()
    this.setState({
      isLeftSliderFocused: true
    })
  }

  handleRightSlideMouseDown(e) {
    e.preventDefault()
    this.setState({
      isRightSliderFocused: true
    })
  }

  handleMouseUp(e) {
    // Change width of NoteList component.
    if (this.state.isRightSliderFocused) {
      this.setState(
        {
          isRightSliderFocused: false
        },
        () => {
          const { dispatch } = this.props
          const newListWidth = this.state.listWidth
          // TODO: ConfigManager should dispatch itself.
          ConfigManager.set({ listWidth: newListWidth })
          dispatch({
            type: 'SET_LIST_WIDTH',
            listWidth: newListWidth
          })
        }
      )
    }

    // Change width of SideNav component.
    if (this.state.isLeftSliderFocused) {
      this.setState(
        {
          isLeftSliderFocused: false
        },
        () => {
          const { dispatch } = this.props
          const navWidth = this.state.navWidth
          // TODO: ConfigManager should dispatch itself.
          ConfigManager.set({ navWidth })
          dispatch({
            type: 'SET_NAV_WIDTH',
            navWidth
          })
        }
      )
    }
  }

  handleMouseMove(e) {
    if (this.state.isRightSliderFocused) {
      const offset = this.refs.body.getBoundingClientRect().left
      let newListWidth = e.pageX - offset
      // 下限はタイトル数文字とアイコンが残る幅。これより狭くしたい場合は
      // 幅ではなく折りたたみ（isNoteListFolded）を使う
      if (newListWidth < MIN_LIST_WIDTH) {
        newListWidth = MIN_LIST_WIDTH
      } else if (newListWidth > 600) {
        newListWidth = 600
      }
      this.setState({
        listWidth: newListWidth
      })
    }
    if (this.state.isLeftSliderFocused) {
      let navWidth = e.pageX
      if (navWidth < 80) {
        navWidth = 80
      } else if (navWidth > 600) {
        navWidth = 600
      }
      this.setState({
        navWidth: navWidth
      })
    }
  }

  handleFullScreenButton(e) {
    this.setState({ fullScreen: !this.state.fullScreen }, () => {
      const noteDetail = document.querySelector('.NoteDetail')
      const noteList = document.querySelector('.NoteList')
      const mainBody = document.querySelector('#main-body')

      if (this.state.fullScreen) {
        this.hideLeftLists(noteDetail, noteList, mainBody)
      } else {
        this.showLeftLists(noteDetail, noteList, mainBody)
      }
    })
  }

  hideLeftLists(noteDetail, noteList, mainBody) {
    this.setState({ noteDetailWidth: noteDetail.style.left })
    this.setState({ mainBodyWidth: mainBody.style.left })
    noteDetail.style.left = '0px'
    mainBody.style.left = '0px'
    noteList.style.display = 'none'
  }

  showLeftLists(noteDetail, noteList, mainBody) {
    noteDetail.style.left = this.state.noteDetailWidth
    mainBody.style.left = this.state.mainBodyWidth
    // フルスクリーン解除時に、折りたたみ中のノート一覧を勝手に復帰させない
    // （この経路は DOM を直接触るため React 側の状態と二重管理になる）
    noteList.style.display = this.props.config.isNoteListFolded
      ? 'none'
      : 'inline'
  }

  render() {
    const { config } = this.props

    // the width of the navigation bar when it is folded/collapsed
    const foldedNavigationWidth = 44
    // 折りたたみ中はノート一覧の占有幅を 0 にして Detail を左端まで広げる。
    // コンポーネント自体はマウントしたまま（アンマウントすると検索文字列や
    // スクロール位置が失われる）
    const isNoteListFolded = !!config.isNoteListFolded
    const listWidth = isNoteListFolded
      ? FOLDED_LIST_WIDTH
      : this.state.listWidth
    // 隠さず細くする。display:none にすると一覧そのものが消えてしまい、
    // 何のペインだったのか手がかりが残らない
    const foldedPaneStyle = { width: FOLDED_LIST_WIDTH }

    return (
      <div
        className='Main'
        styleName='root'
        onMouseMove={e => this.handleMouseMove(e)}
        onMouseUp={e => this.handleMouseUp(e)}
      >
        <SideNav
          {..._.pick(this.props, [
            'dispatch',
            'data',
            'config',
            'match',
            'location'
          ])}
          width={this.state.navWidth}
        />
        {!config.isSideNavFolded && (
          <div
            styleName={
              this.state.isLeftSliderFocused ? 'slider--active' : 'slider'
            }
            style={{ left: this.state.navWidth }}
            onMouseDown={e => this.handleLeftSlideMouseDown(e)}
            draggable='false'
          >
            <div styleName='slider-hitbox' />
          </div>
        )}
        <div
          styleName={config.isSideNavFolded ? 'body--expanded' : 'body'}
          id='main-body'
          ref='body'
          style={{
            left: config.isSideNavFolded
              ? foldedNavigationWidth
              : this.state.navWidth
          }}
        >
          <TopBar
            style={
              isNoteListFolded
                ? foldedPaneStyle
                : { width: this.state.listWidth }
            }
            {..._.pick(this.props, [
              'dispatch',
              'config',
              'data',
              'match',
              'location'
            ])}
          />
          <NoteList
            style={
              isNoteListFolded
                ? foldedPaneStyle
                : { width: this.state.listWidth }
            }
            loading={this.state.isLoading}
            {..._.pick(this.props, [
              'dispatch',
              'data',
              'config',
              'match',
              'location'
            ])}
          />
          {!isNoteListFolded && (
            <div
              styleName={
                this.state.isRightSliderFocused
                  ? 'slider-right--active'
                  : 'slider-right'
              }
              style={{ left: this.state.listWidth - 1 }}
              onMouseDown={e => this.handleRightSlideMouseDown(e)}
              draggable='false'
            >
              <div styleName='slider-hitbox' />
            </div>
          )}
          {/* 開閉ボタンはペイン左下に置く。サイドバーの « と同じ位置・記号で
              揃えるほか、TopBar に置くと最小幅 120px で検索欄と新規ノート
              ボタンに挟まれて成立しないため */}
          {!this.state.fullScreen && (
            <button
              styleName='notelist-fold'
              style={{ left: listWidth ? 4 : 0 }}
              title={`${i18n.__('Toggle Note List')} (${
                isMac ? '⌘⇧B' : 'Ctrl+Shift+B'
              })`}
              aria-label={i18n.__('Toggle Note List')}
              aria-expanded={!isNoteListFolded}
              onClick={() => this.toggleNoteList()}
            >
              <i
                className={
                  isNoteListFolded
                    ? 'fa fa-angle-double-right'
                    : 'fa fa-angle-double-left'
                }
              />
            </button>
          )}
          <Detail
            style={{ left: listWidth }}
            {..._.pick(this.props, [
              'dispatch',
              'data',
              'config',
              'match',
              'location'
            ])}
            ignorePreviewPointerEvents={this.state.isRightSliderFocused}
          />
        </div>
      </div>
    )
  }
}

Main.childContextTypes = {
  status: PropTypes.shape({
    updateReady: PropTypes.bool.isRequired
  }).isRequired,
  config: PropTypes.shape({}).isRequired
}

Main.propTypes = {
  dispatch: PropTypes.func,
  data: PropTypes.shape({}).isRequired
}

export default connect(x => x)(CSSModules(Main, styles))
