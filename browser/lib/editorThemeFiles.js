// エディタ（CodeMirror）テーマのファイル一覧を組み立てる。
//
// fs を注入できるようにしてあるので electron 無しで単体テストできる。
// consts.js は本物の fs を渡すだけ。
//
// ここで解いている問題は 3 つ。いずれも「ディレクトリの .css を機械的に
// 並べる」だけの実装が生んでいたもの。
//
// 1. 同名のファイルが 2 つのディレクトリにあると一覧に 2 回出る。
//    実際 nord.css が node_modules 側と extra_scripts 側の両方にあり、
//    環境設定の選択肢に nord が 2 行並んでいた（React の option の key も
//    重複していた）。
// 2. 自分のクラスを定義していない補助ファイルが選べてしまう。
//    ambiance-mobile.css が定義しているのは .cm-s-ambiance のメディア
//    クエリ補助だけで、.cm-s-ambiance-mobile はどこにも無い。選んでも
//    何も掛からない。
// 3. 一覧の先頭にある default は elegant.css を読み込みながら
//    cm-s-default を当てていた。elegant の指定は 1 つも効かず、実際に出て
//    いたのは CodeMirror 本体（lib/codemirror.css）の既定色。読み込む
//    ファイルが要らないので path を null にして、リンクを張らない。

const path = require('path')
const fs = require('fs')

const DEFAULT_THEME_NAME = 'default'

/**
 * その CSS が自分のクラス .cm-s-<name> を定義しているか。
 *
 * 単純な部分一致だと ambiance-mobile.css の中の `.cm-s-ambiance` が
 * `ambiance` の判定に引っかかる（逆向きの取り違えも起きる）ので、
 * クラス名の切れ目まで見る。
 *
 * @param {string} source CSS の中身
 * @param {string} name テーマ名
 * @returns {boolean}
 */
function definesOwnClass(source, name) {
  const needle = `.cm-s-${name}`
  let index = source.indexOf(needle)
  while (index !== -1) {
    const next = source[index + needle.length]
    if (next === undefined || !/[-A-Za-z0-9_]/.test(next)) return true
    index = source.indexOf(needle, index + 1)
  }
  return false
}

/**
 * テーマ一覧を組み立てる。
 *
 * @param {object} options
 * @param {string[]} options.dirs 走査するディレクトリ。**先に書いたものが優先**。
 *   同梱テーマを先に置く。extra 側は「CodeMirror が持っていないものを足す」
 *   場所で、同名で上書きする場所ではない。逆にすると、古くなった手元のコピーが
 *   メンテされている本家版を黙って隠す（nord がまさにそれだった）
 * @param {function} [options.readDir] 既定は fs.readdirSync
 * @param {function} [options.readFile] 既定は fs.readFileSync（utf8）
 * @returns {Array<{name: string, path: ?string, className: string}>}
 */
function buildEditorThemes(options) {
  const dirs = options.dirs
  const readDir = options.readDir || (dir => fs.readdirSync(dir))
  const readFile = options.readFile || (file => fs.readFileSync(file, 'utf8'))

  const collect = keepAll => {
    const seen = new Set()
    const entries = []
    dirs.forEach(dir => {
      let files
      try {
        files = readDir(dir)
      } catch (e) {
        // extra 側は空になり得る。git は空ディレクトリを追跡しないので、
        // 中身を全部消すと clone 後にディレクトリごと無くなる
        return
      }
      files.forEach(file => {
        if (!/\.css$/i.test(file)) return
        const name = file.substring(0, file.lastIndexOf('.'))
        if (seen.has(name)) return
        const full = path.join(dir, file)
        if (!keepAll) {
          let source
          try {
            source = readFile(full)
          } catch (e) {
            source = ''
          }
          // 読めなかったものは残す。フィルタが取りこぼしでテーマを
          // 消す方が実害が大きい
          if (source && !definesOwnClass(source, name)) return
        }
        seen.add(name)
        entries.push({ name, path: full, className: `cm-s-${name}` })
      })
    })
    return entries
  }

  // フィルタが全部落としたら、フィルタ無しの結果に戻す。
  // 「不正を弾く」だけの層は、全部弾いた時に空を返して自爆する
  let themes = collect(false)
  if (themes.length === 0) themes = collect(true)

  themes.sort((a, b) => a.name.localeCompare(b.name))

  // solarized.css は 1 ファイルで明暗 2 つ分。クラスの組み合わせで出し分ける
  const solarized = themes.findIndex(({ name }) => name === 'solarized')
  if (solarized !== -1) {
    const solarizedPath = themes[solarized].path
    themes.splice(
      solarized,
      1,
      {
        name: 'solarized dark',
        path: solarizedPath,
        className: 'cm-s-solarized cm-s-dark'
      },
      {
        name: 'solarized light',
        path: solarizedPath,
        className: 'cm-s-solarized cm-s-light'
      }
    )
  }

  // cm-s-default は lib/codemirror.css が定義しているので追加の css は要らない
  themes.unshift({
    name: DEFAULT_THEME_NAME,
    path: null,
    className: `cm-s-${DEFAULT_THEME_NAME}`
  })

  return themes
}

/**
 * 一覧から、残すと決めたものだけを取り出す。
 *
 * @param {Array} themes buildEditorThemes の戻り
 * @param {string[]} curatedNames 残す名前（この順に並べる）
 * @returns {Array} curatedNames の順に並んだテーマ
 */
function curateEditorThemes(themes, curatedNames) {
  const byName = new Map(themes.map(theme => [theme.name, theme]))
  const curated = curatedNames
    .map(name => byName.get(name))
    .filter(theme => theme !== undefined)

  // ファイルが見つからず総崩れになった時は、絞らずに全部出す。
  // 選択肢が空の select を出すより、多すぎる方がまだ直せる
  if (curated.length < 2) return themes
  return curated
}

module.exports = {
  DEFAULT_THEME_NAME,
  definesOwnClass,
  buildEditorThemes,
  curateEditorThemes
}
