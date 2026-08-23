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
import {
  resolveSideNavMode,
  resolveNoteListMode,
  nextSideNavMode,
  isFoldedFor,
  isHiddenFor
} from 'browser/main/lib/sideNavMode'
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

// 折りたたみ時の幅の範囲。完全に 0 にすると何のペインだったか分からないので
// 残すが、56px ではアイコンと省略記号しか入らなかった。畳んだ状態でも
// ドラッグで微調整できるようにし、その結果を config に保存する
const MIN_FOLDED_LIST_WIDTH = 64
const MAX_FOLDED_LIST_WIDTH = 200

// 最大幅。600px まで広げられたが、どちらもタイトルの長さ以上には情報が
// 増えないため無駄に場所を取っていた。実用上の上限に寄せる
const MAX_LIST_WIDTH = 360
// 既定値と同値だと「広げる」逃げ道が無くなる。多階層になるとインデントの分
// ラベルが削られ、末尾省略で葉の名前（唯一の識別情報）が消えるので広げられる
// 必要がある
const MAX_NAV_WIDTH = 400

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
      foldedListWidth: config.foldedListWidth || 100,
      navWidth: config.navWidth,
      isLeftSliderFocused: false,
      fullScreen: false,
      noteDetailWidth: 0,
      mainBodyWidth: 0,
      isLoading: true
    }

    this.toggleFullScreen = () => this.handleFullScreenButton()
    // IPC は引数を伴うので、それを捨てるラッパーで受ける
    this.toggleNoteListHandler = () => this.toggleNoteList('ee')
    this.paneTabHandler = e => {
      // keepFocus の再取得が「利用者の次の操作」と喧嘩しないための観測。
      // Tab より後に何か入力があれば、その後のフォーカスは意図的とみなす
      this.lastUserInputAt = window.performance.now()
      this.handlePaneTab(e)
    }
    this.userInputObserver = () => {
      this.lastUserInputAt = window.performance.now()
    }
    // main プロセスの before-input-event からの転送 (#122)。DOM に Tab が
    // 届かない実機環境向けの「予備」経路。同じ押下を DOM も観測した場合は
    // DOM の判断(実行/スキップ)が正: 入力欄では native の Tab 移動が既に
    // 済んでおり、この時点の activeElement は移動後の要素なので、ここで
    // 動くと入力欄からフォーカスを奪ってしまう。1 tick 待つのは、IPC が
    // keydown より先に届く環境でも DOM 側の印を拾えるようにするため
    this.paneTabIpcHandler = (event, payload) => {
      // 編集状態は IPC 受信時点(= native の Tab がフォーカスを動かす前)で
      // 取る。1 tick 後の activeElement は移動後の要素になり得るので、
      // そこで判定すると入力欄発の Tab を「非編集」と誤認して
      // フォーカスを奪ってしまう
      const el = document.activeElement
      const wasEditing = !!(
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable ||
          el.closest('.CodeMirror'))
      )
      setTimeout(() => {
        if (Date.now() - (this.lastDomTabAt || 0) < 100) return
        if (wasEditing) {
          // handlePaneTab を通らない skip なので、trace はここで残す
          window.__tbPaneTab = {
            source: 'ipc',
            key: 'Tab',
            shiftKey: !!(payload && payload.shift),
            activeTag: el ? el.tagName : null,
            decision: 'skip: editable at ipc receipt'
          }
          return
        }
        this.handlePaneTab(
          {
            key: 'Tab',
            shiftKey: !!(payload && payload.shift),
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            preventDefault: () => {}
          },
          'ipc'
        )
      }, 0)
    }
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
  handlePaneTab(e, source = 'dom') {
    // IPC 経路の待ち合わせ用。スキップ判断になる場合でも「DOM がこの
    // Tab を観測した」事実だけは必ず残す
    if (source === 'dom' && e.key === 'Tab') this.lastDomTabAt = Date.now()
    // 直前の判断を残す。効かない時に DevTools で
    // `window.__tbPaneTab` を見れば、どこで抜けたのかが分かる
    const el = document.activeElement
    const trace = {
      source,
      key: e.key,
      shiftKey: e.shiftKey,
      activeTag: el ? el.tagName : null,
      activeClass: el ? String(el.className || '').slice(0, 80) : null,
      decision: null
    }
    const done = reason => {
      trace.decision = reason
      window.__tbPaneTab = trace
      return undefined
    }

    if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) {
      return done('skip: not a bare Tab')
    }

    // 文字入力中の Tab は本来の意味（インデント・次項目）を保つ
    if (el) {
      const tag = el.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable ||
        el.closest('.CodeMirror')
      ) {
        return done('skip: focus is in an editable element')
      }
    }
    // モーダル表示中は中のフォーカス移動を邪魔しない
    if (document.body.getAttribute('data-modal') === 'open') {
      return done('skip: modal is open')
    }

    const noteList = document.querySelector('[data-note-list]')
    const sideNav = document.querySelector('.SideNav')

    // 非表示の要素に focus() しても何も起きず、Tab を握り潰しただけになる。
    // 畳まれたペインや隠れたフォルダを行き先にしないよう可視判定を挟む
    const isVisible = node => !!node && node.offsetParent !== null

    // #122: focus() は成功しているのに、CodeMirror の遅延 focus が後から
    // 着弾して奪い返すことがある（cold start で顕著。トレースでは
    // decision: "moved to ..." なのに最終フォーカスがエディタだった）。
    // 捕捉層を厚くしても直らないのはこのため。移動の直後に2回だけ検証し、
    // **エディタに奪われていた時に限って**取り返す（モーダルや利用者の
    // 明示的なクリックによる正当な移動は尊重する）
    const keepFocus = target => {
      target.focus()
      const startedAt = window.performance.now()
      const reassert = at => {
        setTimeout(() => {
          // Tab の後に利用者が何か操作した（E キーでエディタへ・クリック等）
          // なら、そのフォーカスは意図的な移動。奪い返してはいけない
          // （奪うと、エディタに打っているつもりの入力がノート一覧の
          // 単キーショートカットへ流れる）。取り返すのは、入力が何も無いのに
          // CodeMirror の遅延 focus だけが着弾したケースに限る
          if (this.lastUserInputAt && this.lastUserInputAt > startedAt) return
          const el = document.activeElement
          if (el === target) return
          const stolenByEditor =
            el && el.closest && el.closest('.CodeMirror') !== null
          if (!stolenByEditor) return
          target.focus()
          if (window.__tbPaneTab) {
            window.__tbPaneTab.refocus = {
              at,
              stolenBy: el.tagName
            }
          }
        }, at)
      }
      reassert(60)
      reassert(220)
    }

    if (e.shiftKey) {
      // ノート一覧 → サイドバー。選択中フォルダが見えていればそこへ、
      // 無ければサイドバー自体へ（tabIndex を持つのでフォーカスできる）
      const activeFolder = document.querySelector('.SideNav-active-folder')
      const target = isVisible(activeFolder) ? activeFolder : sideNav
      if (!isVisible(target)) return done('skip: sidebar not visible')
      e.preventDefault()
      keepFocus(target)
      return done('moved to sidebar')
    }

    if (!isVisible(noteList)) return done('skip: note list not visible')
    e.preventDefault()
    keepFocus(noteList)
    return done('moved to note list')
  }

  toggleNoteList(source) {
    // フルスクリーン中は hideLeftLists が DOM を直接触って一覧を隠しており、
    // ここで再描画すると React が display を戻して一覧が復活してしまう。
    // フルスクリーンでは一覧はそもそも見えないので、操作自体を無視する
    if (this.state.fullScreen) return
    const { dispatch, config } = this.props
    // サイドバー(Cmd+B)と同じ3サイクル: 展開 → 細く → 完全に閉じる。
    // 2状態だと畳んでも 100px 残り「少ししか閉じない」ことになる
    const from = resolveNoteListMode(config)
    const mode = nextSideNavMode(from)
    // 「押しても切り替わらない」時の切り分け用（__tbPaneTab と同じ用途）。
    // 呼ばれたか / 読んだ現在値は何か / 何回呼ばれたか、を1つで見る。
    // 1クリックで2件並ぶ＝二重発火（実際にこれで検証側の欠陥を見つけた）
    window.__tbNoteListMode = (window.__tbNoteListMode || [])
      .concat([
        `${source || '?'}:${from}>${mode}@${Math.round(
          window.performance.now()
        )}`
      ])
      .slice(-10)
    ConfigManager.set({
      noteListMode: mode,
      // 旧 boolean を見ている参照が残っているので必ず同時に更新する
      isNoteListFolded: isFoldedFor(mode)
    })
    dispatch({ type: 'SET_NOTE_LIST_MODE', mode })
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
                  "<html>\n<body>\n<h1 id='hello'>Enjoy BoostRecord!</h1>\n</body>\n</html>",
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
            title: 'Welcome to BoostRecord!',
            content:
              '# Welcome to BoostRecord! :guitar:\n## Click here to edit markdown :wave:\n\nBoostRecord is a local-first note-taking app for programmers.\n\n## Quick start :memo:\n- Press `Cmd/Ctrl + N` to create a new note\n- Press `Cmd/Ctrl + P` to jump to any note\n- Link notes with `[Title](:note:<note-key>)` — copy a note link from the note list context menu\n- Store code as **Snippet notes**, prose as **Markdown notes**\n\n## Docs :books:\n- [GitHub (BoxPistols/BoostRecord)](https://github.com/BoxPistols/BoostRecord)\n- [Cloud syncing via OneDrive](https://github.com/BoxPistols/BoostRecord/blob/main/docs/ONEDRIVE-DESKTOP-SETUP.md)'
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
    // capture で受ける。bubble だと途中の React ハンドラが
    // stopPropagation() を呼ぶと window まで届かず、ハンドラが一度も
    // 走らない（実機で window.__tbPaneTab が undefined のままだった）。
    // capture は target へ降りる前に必ず通るので誰にも止められない
    window.addEventListener('keydown', this.paneTabHandler, true)
    window.addEventListener('mousedown', this.userInputObserver, true)
    // それでも実機では Tab が DOM に届かない環境が残った (#122)。
    // main プロセスの before-input-event 転送を第二経路として受ける
    ipcRenderer.on('pane:tab', this.paneTabIpcHandler)
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
    window.removeEventListener('keydown', this.paneTabHandler, true)
    window.removeEventListener('mousedown', this.userInputObserver, true)
    ipcRenderer.removeListener('pane:tab', this.paneTabIpcHandler)
    clearInterval(this.refreshTheme)
  }

  changeRoutePush(event, destination) {
    const { dispatch } = this.props
    dispatch(push(destination))
  }

  toggleMenuBarVisible() {
    const { config } = this.props
    const { ui } = config
    // 元の実装は Object.assign(config, ui) で ui のキー（theme / language 等）を
    // config の直下へばら撒いており、保存のたびに設定が壊れていた。
    // 更新したい部分だけを渡す（ConfigManager.set は差分マージする）
    ConfigManager.set({
      ui: Object.assign({}, ui, { showMenuBar: !ui.showMenuBar })
    })
  }

  handleLeftSlideMouseDown(e) {
    e.preventDefault()
    this.setState({
      isLeftSliderFocused: true
    })
  }

  handleRightSlideMouseDown(e) {
    e.preventDefault()
    // 幅のドラッグが効かない時の切り分け用（DevTools から参照する）
    window.__tbSliderDragging = true
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
          const { dispatch, config } = this.props
          if (config.isNoteListFolded) {
            // 畳んだ幅は config にだけ持つ（reducer の listWidth は
            // 展開時の幅を保つ）
            ConfigManager.set({ foldedListWidth: this.state.foldedListWidth })
            return
          }
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
      const folded = !!this.props.config.isNoteListFolded
      const min = folded ? MIN_FOLDED_LIST_WIDTH : MIN_LIST_WIDTH
      const max = folded ? MAX_FOLDED_LIST_WIDTH : MAX_LIST_WIDTH
      let width = e.pageX - offset
      if (width < min) width = min
      else if (width > max) width = max
      // 畳んでいる時は畳んだ幅の方を動かす。通常幅は畳む前の値のまま残し、
      // 展開したら元の広さに戻るようにする
      this.setState(folded ? { foldedListWidth: width } : { listWidth: width })
    }
    if (this.state.isLeftSliderFocused) {
      let navWidth = e.pageX
      if (navWidth < 80) {
        navWidth = 80
      } else if (navWidth > MAX_NAV_WIDTH) {
        navWidth = MAX_NAV_WIDTH
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
    // Cmd+B の3サイクルの3つ目。サイドバーは display:none で消すが
    // コンポーネントはマウントしたまま（検索文字列が失われないうえ、
    // offsetParent が null になるので Shift+Tab の行き先からも自然に外れる）
    const isSideNavHidden = isHiddenFor(resolveSideNavMode(config))
    const noteListMode = resolveNoteListMode(config)
    const isNoteListFolded = isFoldedFor(noteListMode)
    const isNoteListHidden = isHiddenFor(noteListMode)
    // FOLDED は隠さず細くする（何のペインだったか手がかりを残す）。
    // HIDDEN は幅 0。アンマウントはしない（検索文字列とスクロール位置を失う）
    const listWidth = isNoteListHidden
      ? 0
      : isNoteListFolded
      ? this.state.foldedListWidth
      : this.state.listWidth
    const paneStyle = isNoteListHidden
      ? { width: 0, display: 'none' }
      : { width: listWidth }

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
            left: isSideNavHidden
              ? 0
              : config.isSideNavFolded
              ? foldedNavigationWidth
              : this.state.navWidth
          }}
        >
          <TopBar
            style={paneStyle}
            {..._.pick(this.props, [
              'dispatch',
              'config',
              'data',
              'match',
              'location'
            ])}
          />
          <NoteList
            style={paneStyle}
            loading={this.state.isLoading}
            {..._.pick(this.props, [
              'dispatch',
              'data',
              'config',
              'match',
              'location'
            ])}
          />
          {/* 畳んでいてもドラッグできるようにする（畳んだ幅そのものを
              微調整したいという要望。従来は畳むとスライダーごと消えていた） */}
          <div
            styleName={
              this.state.isRightSliderFocused
                ? 'slider-right--active'
                : 'slider-right'
            }
            style={{ left: listWidth - 1 }}
            onMouseDown={e => this.handleRightSlideMouseDown(e)}
            draggable='false'
          >
            <div styleName='slider-hitbox' />
          </div>
          {/* 開閉ボタンはペイン左下に置く。サイドバーの « と同じ位置・記号で
              揃えるほか、TopBar に置くと最小幅 120px で検索欄と新規ノート
              ボタンに挟まれて成立しないため */}
          {!this.state.fullScreen && (
            <button
              styleName='notelist-fold'
              style={{ left: 4 }}
              title={`${i18n.__('Toggle Note List')} (${
                isMac ? '⌘⇧B' : 'Ctrl+Shift+B'
              })`}
              aria-label={i18n.__('Toggle Note List')}
              aria-expanded={!isNoteListFolded}
              onClick={() => this.toggleNoteList('btn')}
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
