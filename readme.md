<h1 align="center">The Boosters</h1>

<h4 align="center">プログラマ向けノートアプリ Boostnote Legacy の後継。UI/UX を引き継ぎつつ、リアルタイム共同編集・local-first・拡張性を備えた最新スタックへ。</h4>
<h5 align="center">※ Boostnote はサービス終了済みのため、敬意を込めて「The Boosters」へ改名（GPL-3.0 継承）。</h5>

<p align="center">
  <a href="https://github.com/BoxPistols/Boostnote/actions/workflows/ci.yml">
    <img src="https://github.com/BoxPistols/Boostnote/actions/workflows/ci.yml/badge.svg" alt="Legacy CI" />
  </a>
  <a href="https://github.com/BoxPistols/Boostnote/actions/workflows/modern.yml">
    <img src="https://github.com/BoxPistols/Boostnote/actions/workflows/modern.yml/badge.svg" alt="Modern CI" />
  </a>
</p>

> 本家 Boostnote はサービス終了済みです（後継は [BoostNote-App](https://github.com/BoostIO/BoostNote-App)）。
> 本リポジトリは **BoxPistols による Boostnote Legacy のフォーク**で、ライセンス（GPL-3.0）を継承しつつ、
> リアルタイム共同編集・local-first・拡張性を備えたモダンなノートアプリへ段階的に作り替えています。
> ベンチマーク: Obsidian / HackMD。

## リポジトリ構成

| パス | 内容 | ランタイム |
|---|---|---|
| `browser/`, `lib/` | **The Boosters 本体**（フル機能。React 16 + Redux + **Vite 6**、`.cson` ファイル保存）。**Electron 28 へ近代化**し electron-builder で OS App 配布 | Node 22 |
| `app/` | **モダンアプリ土台**（Vite + React 19 + TypeScript + CodeMirror 6）。3ペインUXを再現し、実 `.cson` の読込・新規作成・編集の書き戻し保存（オートセーブ）・タグ編集・フォルダ移動・ゴミ箱（移動/復元/完全削除）・全文検索・一覧ソート（更新/作成/タイトル）・KaTeX 数式プレビュー・コードのシンタックスハイライト・Markdown エクスポート・仮想化リスト・フォルダピッカーに対応。Electron 42。**The Boosters Next** として配布 | Node 22 |
| `poc/collab-core/` | **共同編集コアの実証**（Yjs + CodeMirror 6 + self-host Hocuspocus + `.cson` スナップショット、device-pairing 認証） | Node 22 |
| `docs/` | モダナイゼーション設計判断書（[スタック選定・脅威モデル](docs/MODERNIZATION-2026-stack-selection.md)・[As-Built アーキテクチャ](docs/MODERNIZATION-2026-app-architecture.md)） | — |
| `.claude/skills/boostnote-modernize` | アーキテクチャ判断・作業方針をまとめた Claude Code スキル | — |

### キーボードショートカット（モダンアプリ）

| キー | 動作 |
|---|---|
| ⌘/Ctrl + N | 新規ノート |
| ⌘/Ctrl + F | 検索にフォーカス |
| ⌘/Ctrl + B | 太字（選択をトグル） |
| ⌘/Ctrl + I | 斜体（選択をトグル） |
| ⌘/Ctrl + K | リンク化 |

## 開発

> **Apple Silicon について**: 本体（`browser/`+`lib/`）も **Electron 28 へ近代化済みで arm64 ネイティブ**です（旧 Electron 4 時代の「arm64 ビルドが存在しない」制約は解消）。`The Boosters` / `The Boosters Next` いずれもネイティブ arm64 dmg を配布します。Rosetta は不要です。

```bash
# The Boosters 本体（Node 22 / pnpm / Vite 6 / Electron 28・arm64 ネイティブ）
pnpm install                    # Volta が Node 22 を自動選択。postinstall で Electron 28(arm64) 取得
pnpm run compile && pnpm start  # Vite で renderer をビルドして Electron 起動
pnpm test                       # AVA + Jest
pnpm run lint                   # ESLint
pnpm run dist                   # 配布ビルド（compile + electron-builder + ad-hoc 署名）

# モダンアプリ（Node 22）
cd app
npm install
npm run dev        # ブラウザ（サンプルデータ）
npm test           # .cson データ層テスト
npm run build      # 型チェック付き本番ビルド
BOOSTNOTE_STORAGE="/path/to/storage" npm run electron  # 実 .cson を読むデスクトップ起動

# 共同編集コア（Node 22）
cd poc/collab-core && npm install && npm test
```

## ダウンロードと導入

**[📦 Releases ページ](https://github.com/BoxPistols/TheBoosters/releases/latest)** から最新版を入手します。
**v0.16.4 以降を使用してください**（v0.16.2 / v0.16.3 のインストーラは起動しない致命バグがあります）。

### macOS（Apple Silicon / Intel）

1. Releases から dmg をダウンロード
   - Apple Silicon（M1〜）: `The-Boosters-<ver>-arm64.dmg`（ネイティブ arm64、Rosetta 不要）
   - Intel: `The-Boosters-<ver>-x64.dmg`
2. dmg を開き、**The Boosters.app を `Applications` へドラッグ**
3. **初回のみ**: アプリを**右クリック（Control+クリック）→「開く」→「開く」**
   - Apple Developer 署名がない ad-hoc 署名ビルドのため、「開発元を確認できません」の警告が出ます。この右クリック起動で以後は普通に開けます
4. 2 回目以降は Dock / Launchpad から通常起動

> それでも「壊れているため開けません」と出る場合（旧バージョン等）はターミナルで
> `xattr -cr "/Applications/The Boosters.app"` を実行してから開いてください。

### Windows（x64）

1. Releases から `The-Boosters-Setup-<ver>.exe` をダウンロード
2. 実行すると SmartScreen の警告が出るので **「詳細情報」→「実行」**
3. インストーラの指示に従う（インストール先は変更可能）
4. スタートメニュー / デスクトップから起動

### 初回起動後

- UI は**日本語**で起動します（設定 > インターフェース で変更可）
- ノート保存先はデフォルトで `~/Boostnote`（設定 > ストレージ で追加・変更可）
- **自動更新チェック**（v0.16.4 以降）: 新しいリリースが出ると起動時に通知され、ダウンロードページを開けます。設定 > The Boosters について > Enable Auto Update で ON/OFF

### 検証体制

- 全リリースはパッケージ後に **実行時依存の解決チェック**（`scripts/check-packaged-requires.mjs`）を通過
- **Windows は CI 実機で起動検証**: [win-smoke](.github/workflows/win-smoke.yml) がリリース済み exe をサイレントインストール → 実起動 → メイン UI 到達を機械判定
- macOS は Apple Silicon 実機でインストール〜起動を検証

### The Boosters Next（モダン土台 `app/`・実験的）

Vite + React 19 + CodeMirror 6 の次世代土台（機能は限定）。タグ `app-v*` の push で [release.yml](.github/workflows/release.yml) がビルドし、`The-Boosters-Next-*` として配布されます。

### リリース手順（メンテナ向け）

タグ `v*` の push で [release-legacy.yml](.github/workflows/release-legacy.yml) が macOS / Windows をビルドして Releases に公開します（ローカルからは `pnpm run dist` + `gh release create` でも可）:

```bash
git tag v0.16.5 && git push origin v0.16.5
```

> 恒久課題: **Apple Developer ID + 公証**（$99/年）を導入すれば mac の右クリック手順も不要になります。証明書を GitHub Secrets に登録 → afterPack フックを置き換える設計です。

## 複数端末で同期する

ノートは `<ストレージ>/notes/<key>.cson` の個別ファイルとしてローカルに保存されます。**追加実装なしで複数端末同期**ができます:

1. ストレージフォルダを **OneDrive / iCloud Drive / Dropbox の同期フォルダ内**に置く。
2. 各端末でアプリを起動し、サイドバーの「＋ ストレージを追加」（または空状態の「📂 ストレージフォルダを開く」）から同じフォルダを指定する。

`.cson` が source of truth なのでオフラインでも完全動作します。同じノートを別端末で**同時に**編集した場合のみクラウド側で重複ファイルが生じ、手動解消が必要です（whole-file 同期の制約）。自動・ロスレスなリアルタイム共同編集は `poc/collab-core/`（Yjs CRDT）を配線するアップグレードパスとして用意しています。詳細は [As-Built アーキテクチャ](docs/MODERNIZATION-2026-app-architecture.md) を参照。

## モダナイゼーションの方針（要約）

- **シェル**: Electron を最新サポート版（v42）へ。
- **UI**: React 19 + Redux Toolkit。**現行 UI/UX を踏襲しつつ進化**。
- **エディタ**: CodeMirror 6（source markdown + ライブプレビュー）。
- **同期**: Yjs（CRDT）で **local-first ＋ リアルタイム共同編集**。`.cson` は派生スナップショットとして温存。
- **同期サーバ**: self-host Hocuspocus（平文は自分の VPS、フラットコスト）。共有は自分の複数端末（device-pairing）。
- **優先順位**: まず高速・安定の土台。詳細は [`docs/`](./docs/) を参照。

## ライセンス

[GPL v3](./LICENSE)（BoostIO からの継承）。
