# Rockabilly を外へ出すための段取り

配色そのものは `palette.json` に確定していて、主要な形式の生成物も
`dist/` に揃っている。ここから先は「どこへ、誰の名義で置くか」の話で、
アカウントと公開判断が要るので**実行はしていない**。

## 0. 先に決めること

### 名前

- VS Code Marketplace を Web 検索した範囲では `Rockabilly` という色テーマは
  見つからなかった。ただし**検索エンジンは Marketplace を網羅していない**ので、
  根拠としては弱い。公開前に Marketplace の検索窓、npm、
  tinted-theming の schemes 一覧で直接確認する
- 衝突していた場合の逃げ道は、発行元付きの表示名（`Rockabilly (BoostRecord)`）
  か、識別子だけ変える（`boostrecord-rockabilly`）

### ライセンス

- 本体は GPL-3.0。配色を他ツールへ持ち出せるよう、`assets/rockabilly/` 配下は
  **MIT** で出す想定。分離リポジトリに `LICENSE` を置く
- 生成物のヘッダーに出典 1 行を入れてある（`Generated from palette.json`）

### 置き場所

- 配布物をこのリポジトリに置いたままにすると、GPL のアプリと MIT の配色が
  同居して説明が要る。**独立リポジトリ（例 `boostrecord/rockabilly`）へ切り出す**のが素直
- 切り出す時は `palette.json` / `build.mjs` / `check-contrast.mjs` / `dist/` を
  そのまま持っていける。このリポジトリ側は生成済みの
  `extra_scripts/codemirror/theme/rockabilly.css` だけ残せば動く

## 1. チャネル別の手順

優先度は「使う人が多い順 × 手間の少ない順」。

### VS Code Marketplace（優先度 高）

必要なもの: Azure DevOps の組織、Personal Access Token、`vsce`

```bash
cd assets/rockabilly/dist/vscode
npx @vscode/vsce login <publisher>
npx @vscode/vsce package        # .vsix ができる
npx @vscode/vsce publish
```

公開前に足すもの:

- `README.md`（スクリーンショット必須。Marketplace の見え方はここで決まる）
- `icon.png`（128×128 以上）
- `repository` フィールド（無いと信頼度が下がる）
- `.vscodeignore`

`package.json` の `publisher` は現在 `boostrecord` を仮置きしている。
**実在の publisher id と一致していないと publish が失敗する。**

### iTerm2 / ターミナル各種（優先度 高・手間は最小）

`dist/iterm2/Rockabilly.itermcolors` は plist として妥当なことを
`plutil -lint` で確認済み。iTerm2 の Preferences → Profiles → Colors →
Color Presets → Import で読める。

- 配布はリポジトリの Releases に置くだけで足りる
- 広く見つけてもらうなら [iterm2colorschemes](https://iterm2colorschemes.com/) の
  リポジトリへ PR。同じ内容で Alacritty / kitty / WezTerm / Windows Terminal も
  受け付けているので、`dist/` の各ファイルをそのまま出せる

### base16 / tinted-theming（優先度 中・波及が最大）

`dist/base16/base16-rockabilly.yaml` を tinted-theming の schemes リポジトリへ
出すと、**base16 に対応した数百のアプリへ一度に載る**（Vim, Emacs, tmux, shell,
i3, Firefox ほか）。Rockabilly を「Monokai のように行き渡らせたい」なら
費用対効果はここが一番高い。

- **未確認**: 生成した YAML は tinted-theming の新スキーマ（`system: base16` +
  `palette:`）の形で書いてあるが、向こうのバリデータに通していない。
  提出前に schemes リポジトリの CI をローカルで回す
- base00〜base0F の割り当ては `build.mjs` の該当ブロックに書いてある

### JetBrains / Sublime / Vim（優先度 低）

- JetBrains は `.icls`、Sublime は `.sublime-color-scheme`。どちらも
  `palette.json` から生成器を足せば出せるが、まだ書いていない
- Vim/Neovim は base16 経由で自動的に載るので、単体で作る必要は薄い

### npm パッケージ（優先度 低）

`@boostrecord/rockabilly` として `palette.json` と各形式を配ると、
他のツールから `import palette from '@boostrecord/rockabilly'` で参照できる。
Web の配色に使いたい人向け。

## 2. 公開前に必ず通すもの

```bash
node assets/rockabilly/check-contrast.mjs   # 全色が下限を満たすか
node assets/rockabilly/build.mjs            # 生成物を作り直す
npx jest tests/lib/rockabillyPalette.test.js
git status                                   # dist/ に差分が残っていないか
```

**判定書に「確認済み」と書かない。** 上のコマンドが通ることが判定で、
文書は毎回それを指すだけにする。

## 3. 見せ方

- スクリーンショットは **同じコードを各ツールで撮る**。言語は JavaScript /
  Python / Markdown の 3 つあれば足りる
- 「真空管アンプの朱赤と琥珀」という由来を 1 行で書く。色の羅列より覚えられる
- コントラスト比を明記する。暗色テーマは「格好いいが読めない」ものが多いので、
  全色 4.5:1 以上という数字がそのまま差別化になる

## 4. まだやっていないこと

- Marketplace / npm / tinted-theming での名前の空き確認（Web 検索止まり）
- tinted-theming のスキーマ検証
- スクリーンショットとアイコン
- 独立リポジトリへの切り出しと LICENSE
- JetBrains / Sublime の生成器
