// Cmd/Ctrl+F は main プロセスの before-input-event が捕まえて preventDefault
// するので、**受け口を持たない画面では検索がひとつも動かない**。
// v0.21.0〜v0.24.0 のスニペットノートがまさにこれで、CodeMirror 内蔵の検索も
// 殺してあるため逃げ道が無かった。詳細ペインを増やした時に同じ穴が空かないよう、
// 送り手と受け手が揃っていることをソースで確かめる。
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

const DETAILS = [
  'browser/main/Detail/MarkdownNoteDetail.js',
  'browser/main/Detail/SnippetNoteDetail.js'
]

describe('detail:find の配線', () => {
  it('main プロセスが Cmd/Ctrl+F で detail:find を送る', () => {
    const menu = read('lib/main-menu.js')
    expect(menu).toContain("send('detail:find')")
  })

  DETAILS.forEach(file => {
    it(`${path.basename(file)} が detail:find を受ける`, () => {
      expect(read(file)).toContain("ipcRenderer.on('detail:find'")
    })

    it(`${path.basename(file)} が detail:find を外す`, () => {
      expect(read(file)).toContain("removeListener('detail:find'")
    })

    it(`${path.basename(file)} が FindBar を描画する`, () => {
      expect(read(file)).toContain('<FindBar')
    })
  })
})

describe('CodeMirror 内蔵の検索を殺した以上、代わりが要る', () => {
  it('内蔵の検索・置換キーは無効化したままにする', () => {
    const editor = read('browser/components/CodeEditor.js')
    // 内蔵ダイアログは IME 変換の確定 Enter で閉じてしまう（詳細は FindBar.js）
    expect(editor).toContain("'Cmd-F': false")
    expect(editor).toContain("'Ctrl-F': false")
  })
})
