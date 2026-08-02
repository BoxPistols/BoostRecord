// CodeEditor -> ConfigManager が読み込み時に electron-config を生成するため、
// app.getPath を持つ electron のモックが要る
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn()
  },
  app: { getPath: () => '/tmp', getName: () => 'test', getVersion: () => '0' },
  remote: { app: { getPath: () => '/tmp' } }
}))

// エディタ本体は CodeMirror / MarkdownPreview（<script> 読み込み前提の
// グローバルを使う）を引き込む。ここでは描画しないので丸ごと差し替える
// (jest.mock は babel-plugin-webpack-alias の対象外なので相対パスで書く)
jest.mock('../../browser/components/CodeEditor', () => 'CodeEditor')
jest.mock('../../browser/components/MarkdownEditor', () => 'MarkdownEditor')

import SnippetNoteDetail from 'browser/main/Detail/SnippetNoteDetail'

// SnippetNoteDetail のマウントには CodeMirror・dataApi・Electron が要る。
// ここで守りたいのはタブ移動の index 計算と description の開閉条件だけなので、
// prototype にだけ state / setState を生やして純粋なロジックを叩く
const makeInstance = (snippetCount, snippetIndex = 0) => {
  const instance = Object.create(SnippetNoteDetail.prototype)
  instance.refs = {}
  instance.state = {
    snippetIndex,
    showArrows: false,
    showJumpHints: true,
    isDescriptionPinned: false,
    isDescriptionFocused: false,
    note: {
      snippets: Array.from({ length: snippetCount }, (_, i) => ({
        name: 'tab-' + i,
        mode: null,
        content: '',
        linesHighlighted: []
      }))
    }
  }
  instance.setState = (patch, callback) => {
    const next = typeof patch === 'function' ? patch(instance.state) : patch
    Object.assign(instance.state, next)
    if (callback) callback()
  }
  instance.focusEditor = jest.fn()
  return instance
}

describe('SnippetNoteDetail tab navigation', () => {
  it('jumps to the nth tab and hides the jump hints', () => {
    const instance = makeInstance(4)
    instance.jumpToTab(2)
    expect(instance.state.snippetIndex).toBe(2)
    expect(instance.state.showJumpHints).toBe(false)
    expect(instance.focusEditor).toHaveBeenCalled()
  })

  it('ignores a jump past the last tab', () => {
    const instance = makeInstance(3, 1)
    instance.jumpToTab(5)
    expect(instance.state.snippetIndex).toBe(1)
    expect(instance.focusEditor).not.toHaveBeenCalled()
  })

  it('ignores a jump beyond the 9 badged tabs', () => {
    const instance = makeInstance(12, 0)
    instance.jumpToTab(9) // 10 枚目。バッジが出ていないので飛ばさない
    expect(instance.state.snippetIndex).toBe(0)

    instance.jumpToTab(8) // 9 枚目は飛べる
    expect(instance.state.snippetIndex).toBe(8)
  })

  it('wraps around when moving to the next / previous tab', () => {
    const instance = makeInstance(3, 2)
    instance.jumpNextTab()
    expect(instance.state.snippetIndex).toBe(0)

    instance.jumpPrevTab()
    expect(instance.state.snippetIndex).toBe(2)
  })

  it('clamps an out-of-range index instead of moving off the tab list', () => {
    // タブ削除の競合で snippetIndex が範囲外に残ることがある
    const instance = makeInstance(2, 5)
    expect(instance.getActiveSnippetIndex()).toBe(1)
    instance.jumpNextTab()
    expect(instance.state.snippetIndex).toBe(0)
  })
})

describe('SnippetNoteDetail description', () => {
  it('is collapsed by default', () => {
    expect(makeInstance(1).isDescriptionExpanded()).toBe(false)
  })

  it('expands while focused and collapses again on blur', () => {
    const instance = makeInstance(1)
    instance.handleDescriptionFocus()
    expect(instance.isDescriptionExpanded()).toBe(true)

    instance.handleDescriptionBlur()
    expect(instance.isDescriptionExpanded()).toBe(false)
  })

  it('stays expanded after the toggle even when focus leaves', () => {
    const instance = makeInstance(1)
    instance.handleDescriptionToggleClick()
    expect(instance.isDescriptionExpanded()).toBe(true)

    instance.handleDescriptionFocus()
    instance.handleDescriptionBlur()
    expect(instance.isDescriptionExpanded()).toBe(true)
  })

  it('collapses on toggle even if the textarea is still focused', () => {
    const instance = makeInstance(1)
    instance.handleDescriptionToggleClick()
    instance.handleDescriptionFocus()

    instance.handleDescriptionToggleClick()
    expect(instance.isDescriptionExpanded()).toBe(false)
  })
})
