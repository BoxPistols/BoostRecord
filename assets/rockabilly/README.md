# Rockabilly

真空管アンプの朱赤と琥珀を、ニュートラルなチャコールに載せた暗色スキーム。
The Boosters の UI テーマとして生まれたものを、エディタ・ターミナル向けに
配布できる形へ切り出したもの。

## 中身

```
palette.json          原盤。色はここにしか書かない
check-contrast.mjs    地に対するコントラストを実測する（下限も palette.json 側）
build.mjs             配布物をまとめて生成する
dist/                 生成物（手で編集しない）
```

`dist/` の下は形式ごとに分かれている。

| 形式 | 出力 |
| --- | --- |
| CodeMirror 5 | `dist/codemirror/rockabilly.css` |
| VS Code | `dist/vscode/`（拡張機能の雛形一式） |
| iTerm2 | `dist/iterm2/Rockabilly.itermcolors` |
| Windows Terminal | `dist/windows-terminal/rockabilly.json` |
| Alacritty | `dist/alacritty/rockabilly.toml` |
| kitty | `dist/kitty/rockabilly.conf` |
| WezTerm | `dist/wezterm/rockabilly.lua` |
| base16 / tinted-theming | `dist/base16/base16-rockabilly.yaml` |
| CSS カスタムプロパティ | `dist/css/rockabilly.css` |

CodeMirror の CSS だけは `extra_scripts/codemirror/theme/rockabilly.css` にも
複製される。アプリの環境設定に出るのはそちら。

## 触り方

```bash
# 色を変えたら必ずこの順で
node assets/rockabilly/check-contrast.mjs   # 下限割れがあれば exit 1
node assets/rockabilly/build.mjs            # 全形式を生成し直す
npx jest tests/lib/rockabillyPalette.test.js
```

`tests/lib/rockabillyPalette.test.js` は、原盤と生成物がずれていないこと、
アプリの UI テーマ（`$ui-rockabilly-*`）と地・朱赤・文字色が同じであること、
コントラストの下限を満たすことを見ている。**生成し直さずに原盤だけ変えると
落ちる。**

## 色の決め方

- 地・文字・朱赤・罫線は `browser/styles/index.styl` の `$ui-rockabilly-*` と
  同じ値。UI とエディタで違う黒を使わない
- 構文色は WCAG 2.1 の 1.4.3（本文 4.5:1）を全色で満たす。地に対する実測値は
  `check-contrast.mjs` が出す
- 朱赤 `#D7263D` は地に対して 3.43:1。文字には使わず、カーソル・枠・バッジ
  など非テキスト（1.4.11 の 3:1）に限る。構文色の赤は明度を上げた
  `#F0576B`（5.09:1）
- ANSI の `brightBlack` は「暗いこと自体が役割」なので下限を 3:1 に置く

## ライセンス

The Boosters 本体は GPL-3.0 だが、配色そのものは他ツールへ持ち出せるよう
**MIT** で配布する想定（`dist/vscode/package.json` の `license` も MIT）。
リポジトリを分ける際に LICENSE ファイルを添える。
