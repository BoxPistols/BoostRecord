# The Boosters → BoostRecord 改名 移行手順書

最終更新: 2026-08-22 / 対象リポジトリ: `BoxPistols/TheBoosters`

---

## 1. 背景と決定

### 改名の理由

`The Boosters` が **NewsPicks Studios 制作の対談番組「THE BOOSTERS」**（ホスト: 石丸伸二氏）と完全に同名です。
検索時に番組が上位を占有するため、プロダクト名として認知を獲得できません。

### 新名称: **BoostRecord**

```
Boostnote  →  BoostRecord
   ↑                ↑
Boost を継承      Note → Record
```

| 観点 | 評価 |
|---|---|
| アップストリームへの敬意 | `Boost` を綴りに残し、Boostnote の系譜を明示 |
| 機能の説明力 | `Record` = 記録する。ノートアプリの機能そのもの |
| 世界観との整合 | `Record` = レコード盤。`docs/UI-CONCEPT-classic-rock.md` のコンセプトに直結 |
| 綴りの可読性 | `boost` + `record` の既知語2語。二重字・同音異義なし。カナ表記「ブーストレコード」で一意 |

### 検討済みで却下した候補（再検討を防ぐための記録）

約50候補を精査した結果の主な脱落理由。

| 候補 | 却下理由 |
|---|---|
| Slapback | ブルックリンのロカビリー系ブティック、ウィーンのロカビリーバンドが実在。同じサブカルチャー圏で衝突 |
| Backline | ミュージシャン向けアクセラレータープログラムが実在。業態が一致 |
| The Igniters | 同名バンドが4組以上、ドメインも取得済み |
| Redline | RedLine Stealer（インフォスティーラー型マルウェア、MITRE ATT&CK S1240）と同名 |
| Boogaloo | 反政府武装過激派運動の名称（ADL・West Point CTC が監視対象として報告）。**使用厳禁** |
| Overdrive | OverDrive Japan（電子図書館）、株式会社オーバードライブ（デザイン会社） |
| Boogie | Boogie® は Mesa/Boogie の登録商標（現 Gibson 傘下、商標42件） |
| Boost（単体） | Boost C++ Libraries、Boost Mobile |
| BBB | Better Business Bureau の登録商標。消費者認知率83%、bbb.org は全米800位以内 |
| BoostDance | `boost dance` がダンススタジオ向けSEO記事に占拠。`boostdance` に `std` が混入 |

### 既知の残存リスク

`Boost Records`（アトランタ、年商500万ドルの音楽制作会社）が英語圏に実在します。
単数/複数の差は検索エンジンでは吸収されるため、**英語圏では埋没します**。
日本市場を主戦場とする前提での採用判断です。海外展開時に再評価してください。

---

## 2. 影響範囲（実測値）

```
出現箇所: 665
対象ファイル: 76
```

### 表記ゆれ（5種類。すべて個別に置換方針を決めること）

| 表記 | 出現数 | 置換後 | 用途 |
|---|---|---|---|
| `The Boosters` | 595 | `BoostRecord` | 表示名・文章 |
| `TheBoosters` | 20 | `BoostRecord` | リポジトリ名・URL |
| `the-boosters` | 12 | `boostrecord` | npm パッケージ名・kebab 識別子 |
| `theboosters` | 10 | `boostrecord` | appId・小文字識別子 |
| `The-Boosters` | — | `BoostRecord` | `artifactName`（リリース資産名） |

### ファイル種別の内訳

| 種別 | 件数 | 備考 |
|---|---|---|
| `.json` | 27 | うち20件が `locales/*.json`（多言語UI文字列） |
| `.js` | 20 | `lib/main-menu.js` など |
| `.md` | 15 | readme・docs |
| `.mjs` / `.cjs` | 4 | ビルドスクリプト |
| `.html` | 3 | |
| `.yml` / `.yaml` | 3 | `.github/workflows/win-smoke.yml` を含む |
| その他 | 4 | `.tsx`, `.styl`, `.dic` |

---

## 3. 最重要リスク: userData ディレクトリの移動

**この項目を読まずに置換を実行しないこと。**

Electron は `package.json` の `productName`（未設定時は `name`）から userData ディレクトリを決定します。
`productName` を変更すると、**既存ユーザーのデータ保存先パスが変わり、アプリからは空の状態に見えます。**

### 失われる（参照できなくなる）データ

| パス | 内容 | 参照箇所 |
|---|---|---|
| `userData/` 配下のキーストア | AI プロバイダの API キー（暗号化保存） | `lib/ai/ipc.js:26`, `lib/ai/secureKeys.js` |
| `userData/snippets.json` | スニペット | `browser/lib/consts.js:29` |
| `userData/media-backups/` | 添付ファイルのバックアップ | `browser/main/lib/dataApi/attachmentOps.js:27,153` |
| `userData/boostnote.service` | IPC サービスファイル | `lib/ipcServer.js:54`, `browser/main/lib/ipcClient.js:15` |

> ノート本体（`.cson`）はユーザーが指定したストレージパス（既定は `~/Boostnote`）に保存されるため、
> userData の移動では失われません。影響を受けるのは上記の付随データです。

### 対応方針: **方針A を採用し、実装済み**

起動時に旧 userData ディレクトリを検出し、新ディレクトリへコピーする一回限りの処理を実装しました。

| ファイル | 役割 |
|---|---|
| `lib/migrate-userdata.js` | 移行本体。electron 非依存の純粋関数 `migrateUserData()` と、`app.getPath('userData')` を渡す薄いラッパー `migrateUserDataFromElectron()` |
| `index.js` | `require('./lib/main-app')` の直前で呼び出す。`lib/main-app.js` は7行目で electron-config が userData に触るため、それより前である必要がある |
| `tests/lib/migrate-userdata.test.js` | 6シナリオの検証 |

実装上の決定:

- **コピーであって移動ではない。** 旧ディレクトリは無傷で残るため、問題があれば復旧できる
- **移行先に既にあるファイルは上書きしない**（`force: false`）。新しい側を常に優先する
- **一度成功したら `.userdata-migrated` マーカーを書き、以降は何もしない**
- **改名前は旧名と現在名が一致するため自己コピーを検出して no-op になる。** 改名の前に本コードを入れても安全
- **実行時ファイルは除外する。** `boostnote.service`（node-ipc の Unix ドメインソケット。古いものを持ち込むと接続先が死んでいる状態になり、プラットフォームによっては `cpSync` 自体が ENOTSUP で失敗する）、`Singleton*`、各種 `Cache`
- **移行の失敗でアプリの起動を止めない。** `index.js` 側で try/catch し、ログのみ出す

検証: 6シナリオ（旧ディレクトリ無し / コピー / マーカーと再実行 / 既存ファイル保護 / 実行時ファイル除外 / 自己コピー防止）が通過。

<details>
<summary>参考: 当初の検討案（記録用）</summary>


```js
// 疑似コード: index.js の app.whenReady() より前
const oldDir = path.join(path.dirname(app.getPath('userData')), 'The Boosters')
const newDir = app.getPath('userData')
if (fs.existsSync(oldDir) && !fs.existsSync(path.join(newDir, '.migrated'))) {
  fs.cpSync(oldDir, newDir, { recursive: true, errorOnExist: false })
  fs.writeFileSync(path.join(newDir, '.migrated'), new Date().toISOString())
}
```

**方針B: `productName` を据え置き、表示名だけ変える**

`package.json` の `productName` は `The Boosters` のまま残し、UI 上の表示文字列のみ `BoostRecord` にする。
データは移動しないが、OS のアプリ名・インストール先フォルダ名が旧名のまま残る。**暫定策としてのみ推奨。**

**方針C: 破壊的変更として告知する**

メジャーバージョンを上げ、リリースノートで手動移行手順を案内する。既存ユーザーが少数の場合のみ現実的。

</details>

---

## 4. 作業手順

### Phase 0: 事前確認（コードに触れる前）

- [ ] [J-PlatPat](https://www.j-platpat.inpit.go.jp/) で `BOOSTRECORD` / `ブーストレコード` を第9類（ソフトウェア）・第42類（SaaS）で検索
- [ ] `boostrecord.com` / `boostrecord.jp` の空き確認（`boostrecords.com` は既存企業が保有）
- [ ] `@boostrecord` の X / Instagram / GitHub Organization
- [ ] 日英両方での素の Google 検索

### Phase 1: 文字列置換

表記ゆれごとに**個別に**実行する。一括の大文字小文字無視置換は禁止（下記「置換対象外」に抵触するため）。

```bash
# 1. 表示名
grep -rl "The Boosters" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dictionaries . \
  | xargs sed -i 's/The Boosters/BoostRecord/g'

# 2. リリース資産名（ハイフン区切り）
grep -rl "The-Boosters" --exclude-dir=.git --exclude-dir=node_modules . \
  | xargs sed -i 's/The-Boosters/BoostRecord/g'

# 3. リポジトリ名表記
grep -rl "TheBoosters" --exclude-dir=.git --exclude-dir=node_modules . \
  | xargs sed -i 's/TheBoosters/BoostRecord/g'

# 4. kebab / 小文字識別子
grep -rl "the-boosters" --exclude-dir=.git --exclude-dir=node_modules . \
  | xargs sed -i 's/the-boosters/boostrecord/g'
grep -rl "theboosters" --exclude-dir=.git --exclude-dir=node_modules . \
  | xargs sed -i 's/theboosters/boostrecord/g'

# 5. 残存確認
grep -rn -i "booster" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dictionaries .
```

最後の `grep` で残るのは **Boostnote への言及のみ**であるべき（次節参照）。

### Phase 2: ビルド識別子

`package.json` の `build` セクション。**Phase 1 の置換では意図した値にならない箇所があるため個別に確認する。**

| キー | 現在値 | 変更後 | 注意 |
|---|---|---|---|
| `name` | `the-boosters` | `boostrecord` | npm 名は小文字必須 |
| `productName` | `The Boosters` | `BoostRecord` | **userData 移動あり（3章参照）** |
| `build.appId` | `io.boxpistols.theboosters` | `io.boxpistols.boostrecord` | **変更すると別アプリ扱いになり自動更新が切れる** |
| `build.productName` | `The Boosters` | `BoostRecord` | |
| `build.publish.repo` | `TheBoosters` | `BoostRecord` | GitHub リポジトリ名と一致必須 |
| `build.mac.artifactName` | `The-Boosters-${version}-${arch}.${ext}` | `BoostRecord-${version}-${arch}.${ext}` | |
| `build.win.artifactName` | `The-Boosters-Setup-${version}.${ext}` | `BoostRecord-Setup-${version}.${ext}` | |

> `build.copyright` は `GPL-3.0, inherited from BoostIO (Boostnote)` のまま**変更しないこと**。

### Phase 3: GitHub リポジトリ名の変更

1. https://github.com/BoxPistols/TheBoosters/settings → Repository name を `BoostRecord` へ
2. GitHub は旧 URL を自動リダイレクトするが、以下は明示的に更新する
   ```bash
   git remote set-url origin https://github.com/BoxPistols/BoostRecord.git
   ```
3. ~~`readme.md` のバッジ URL を修正~~ → **対応済み**（下記参照）
4. `build.publish.repo` が新リポジトリ名と一致していることを再確認

### 実施済み: 陳腐化した `BoxPistols/Boostnote` 参照の修正

リポジトリは過去に `Boostnote` → `TheBoosters` へ改名されていますが、4箇所が旧名を指したままでした。
改名とは独立した既存の不具合のため、先行して `BoxPistols/TheBoosters` へ修正済みです。
Phase 1 の置換で `TheBoosters` → `BoostRecord` に追随します。

| ファイル | 内容 |
|---|---|
| `readme.md` | CI バッジ4箇所（Actions のバッジ URL はリダイレクトを追従しないため実際に壊れていた） |
| `app/package.json` | `repository.url` |
| `app/CHANGELOG.md` | 冒頭の母体リポジトリへのリンク |
| `.claude/skills/boostnote-modernize/SKILL.md` | PR 提出先の指定。放置すると以後のエージェントが誤ったリポジトリへ PR を出す |

---

### Phase 4: CI / リリース

- [ ] `.github/workflows/*.yml` 内の成果物パス・アーティファクト名を更新（特に `win-smoke.yml`）
- [ ] 既存 GitHub Releases の資産名は旧名のまま残る。自動更新の feed を壊さないよう、
      リリースを跨いだ `appId` 変更のタイミングを設計する
- [ ] `.github/FUNDING.yml` の記載を確認

### Phase 4 の実施手順: 改名リリース

#### 前提: この app に自動インストール型の更新機構は無い

`lib/main-app.js:38-80` の実装は electron-updater ではなく、**GitHub API の latest release を見て通知し、クリックされたらブラウザでリリースページを開くだけ**の仕組みです。署名なし mac アプリに Squirrel が使えないため置き換えた経緯がコメントに残っています。

```js
const UPDATE_REPO = 'BoxPistols/BoostRecord'
fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`)
  // tag_name と app.getVersion() を比較し、新しければ renderer へ 'update-found'
ipc.on('update-app-confirm', () => { shell.openExternal(latestReleaseUrl) })
```

したがって **`build.appId` の変更で壊れる自動更新は存在しません**。appId 変更の実影響は、OS 上のアプリ識別・インストール先・userData パス（移行処理が吸収）と、**新旧2つのアプリが並存すること**です。

#### 旧アプリへ通知は届く

旧インストールには `UPDATE_REPO = 'BoxPistols/TheBoosters'` がビルド時に焼き込まれています。
[GitHub のドキュメント](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)によれば、リポジトリ改名後は REST API の **GET に 301 が返り**、`fetch` はデフォルトでリダイレクトを追従します。

**よって「旧 appId のままの最終リリースを1本出す」という工程は不要です。** リポジトリを改名したうえで新しいリリースを公開すれば、旧アプリの更新チェックがそれを検出します。

#### ⚠️ 絶対に守るルール

**`BoxPistols/TheBoosters` という名前で新しいリポジトリを作らないこと。**

GitHub は「改名前の名前で新しいリポジトリが作られると、リダイレクトは機能しなくなる」と明記しています。作った瞬間に旧アプリの更新チェックが恒久的に壊れ、ユーザーは取り残されます。

#### 手順

1. **リポジトリ改名（Phase 3）を先に完了させる**
2. **リダイレクトを実測で確認する**
   ```bash
   curl -sSL -o /dev/null -w "%{http_code} %{url_effective}\n" \
     -H "accept: application/vnd.github+json" -H "user-agent: check" \
     https://api.github.com/repos/BoxPistols/TheBoosters/releases/latest
   ```
   `BoostRecord` に解決していれば OK
3. **バージョンを上げる**（`0.25.0` → `0.26.0`）。旧アプリの `isNewerVersion` 比較に引っかかる必要がある
4. **タグを打ってリリースを公開**
5. **旧アプリを起動し、更新通知が出てリリースページが開くことを確認**
6. 新アプリを入れ、userData の引き継ぎを確認したうえで旧アプリをアンインストール

#### リリースノートのテンプレート

```markdown
## The Boosters は BoostRecord になりました

同名のメディア番組との混同を避けるため、アプリ名を変更しました。
Boostnote の系譜を示す `Boost` は残し、`Note` を `Record`（記録する／レコード盤）
に置き換えています。

### 移行について

**これは別アプリとしてインストールされます。** 旧 The Boosters は自動では
置き換わりません。

- **ノート本体は影響を受けません。** `.cson` はこれまでどおり、設定した
  ストレージパス（既定 `~/Boostnote`）にあります
- **初回起動時に以下を自動で引き継ぎます**
  - AI プロバイダの API キー
  - スニペット
  - 添付ファイルのバックアップ
  - アプリ設定
- 引き継ぎは**コピー**です。旧データはそのまま残るので、問題があれば
  旧アプリに戻れます

### 手順

1. BoostRecord をインストールして起動する
2. ノート・設定・API キーが揃っていることを確認する
3. 確認できたら The Boosters をアンインストールする
```

---

### Phase 5: 検証

```bash
pnpm install
pnpm run lint
pnpm run compile        # Vite ビルド
pnpm test               # ava + jest
pnpm run dist:dir       # パッケージング（署名なし）
```

- [ ] アプリが起動し、既存の `.cson` ストレージを読める
- [ ] userData の移行が機能している（方針Aを選んだ場合）
- [ ] 各ロケールでメニューとタイトルが `BoostRecord` を表示する
- [ ] `e2e:*` プローブが通る

---

## 5. 置換対象外（触ってはいけない箇所）

| 対象 | 理由 |
|---|---|
| `LICENSE` | GPL-3.0 の原文 |
| `build.copyright` | BoostIO への著作権表示。**GPL-3.0 は著作権表示の保持を要求する。改変は license 違反** |
| `readme.md` の Boostnote への帰属記述 | 同上。フォーク元の明示は継続する |
| `dictionaries/*.dic` | スペルチェック辞書。一般語として `booster` が含まれる可能性がある |
| `lib/ipcServer.js` の `boostnote.service` | 旧名のファイル名を変えると既存プロセスとの IPC が切れる。変更は別タスクとして分離 |
| `~/Boostnote`（既定ストレージパス） | ユーザーのノート実体。変更するとデータが見えなくなる |

**原則: `Boostnote` は残し、`Boosters` のみを置換する。**

---

## 6. ロールバック

Phase 1〜2 はすべて単一ブランチ上のコミットで完結するため、`git revert` で戻せます。

Phase 3（リポジトリ名変更）を実行した後は、GitHub 設定画面から元の名前へ戻せます。
旧名は他者に取得されない限り再取得可能ですが、**リダイレクトは新旧どちらか一方向にしか張られない**ため、
リポジトリ名の変更は Phase 1〜2 が検証を通ってから実施してください。

Phase 4 で新しい `appId` のリリースを公開した後のロールバックは、
ユーザー側に二重インストール状態を生むため実質不可逆です。**リリース前が最終判断点です。**

---

## 7. チェックリスト（作業用）

```
Phase 0  事前確認
  [ ] J-PlatPat（第9類・第42類）
  [ ] ドメイン
  [ ] SNS ハンドル
  [ ] Google 検索（日英）

Phase 1  文字列置換
  [ ] The Boosters  → BoostRecord
  [ ] The-Boosters  → BoostRecord
  [ ] TheBoosters   → BoostRecord
  [ ] the-boosters  → boostrecord
  [ ] theboosters   → boostrecord
  [ ] 残存 grep で Boostnote 以外が出ないこと

Phase 2  ビルド識別子
  [ ] name / productName
  [ ] appId（userData 移行方針の決定込み）
  [ ] publish.repo
  [ ] artifactName（mac / win）
  [ ] copyright を変更していないこと

Phase 3  GitHub
  [ ] リポジトリ名変更
  [ ] remote 更新
  [ ] readme バッジ URL

Phase 4  CI / リリース
  [ ] ワークフローの成果物名
  [ ] 自動更新の互換性設計

Phase 5  検証
  [ ] lint / compile / test
  [ ] dist:dir でパッケージング
  [ ] 起動・ストレージ読込
  [ ] userData 移行
  [ ] 全ロケール表示
```
