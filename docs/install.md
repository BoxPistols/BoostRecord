# インストールガイド — セキュリティ警告の対処を含む

BoostRecord のインストーラは現在**コード署名されていません**（Windows）/ **Apple の公証を受けていません**（macOS）。そのため初回起動時に OS が「発行元を確認できない」趣旨の警告を出します。このページは、その警告が**何であるか**と、OS・バージョン別の**正しい開き方**をまとめたものです。

> レガシー版（`v*` リリース）・BoostRecord Next（`app-v*` リリース）とも警告と対処は同じです。

## この警告は何か（先に読んでください）

- 警告の正体は**マルウェア検出ではなく、「開発元の身元証明が無い」ことへの注意喚起**です。署名証明書の取得には費用と審査が必要で、個人開発の OSS では未署名のまま配布される段階がよくあります
- 安全性の判断材料はすべて公開されています
  - ソースコードは本リポジトリで全公開（GPL-3.0）
  - リリースはタグ push を起点に [GitHub Actions](../.github/workflows/release-legacy.yml) がビルド・公開
  - Windows インストーラは CI 実機でサイレントインストール → 起動 → メイン UI 到達まで機械検証（[win-smoke](../.github/workflows/win-smoke.yml)）
- **ダウンロードは必ず公式 Releases から**: <https://github.com/BoxPistols/BoostRecord/releases>
  - URL が `github.com/BoxPistols/BoostRecord` であることを確認してください。他サイトで再配布されたバイナリは検証していません
- 署名対応の計画: Windows は SignPath Foundation（OSS 向け無料署名）、macOS は Apple Developer Program による署名 + 公証への対応を進めています。対応後のリリースからこのページの手順は不要になります

## ダウンロード

| 環境 | ファイル |
|---|---|
| macOS Apple Silicon（M1〜） | `BoostRecord-<ver>-arm64.dmg` |
| macOS Intel | `BoostRecord-<ver>-x64.dmg` |
| Windows x64 | `BoostRecord-Setup-<ver>.exe` |

**v0.16.4 以降を使用してください**（v0.16.2 / v0.16.3 のインストーラには起動しない致命バグがあります）。

ダウンロード時点でブラウザ（Edge / Chrome）が「一般的にダウンロードされていません」等の警告を出すことがあります。ダウンロード一覧からファイルのメニューを開き **「保持する」/「保存」** を選んでください（これも実績ベースの警告で、ファイルの異常を検出したものではありません）。

## macOS での開き方

1. dmg を開き、**BoostRecord.app を `Applications` へドラッグ**
2. 初回のみ、お使いの macOS バージョンに応じて以下の手順で起動します（2 回目以降は Dock / Launchpad から通常起動）

### macOS 15（Sequoia）以降

macOS 15 で「右クリック → 開く」による回避手順は**廃止されました**。次の手順で開きます。

1. アプリをダブルクリック → 「**"BoostRecord" は開かれませんでした**」（Apple はマルウェアが含まれていないことを検証できませんでした）と出るので **「完了」** を押す（**「ゴミ箱に入れる」を押さない**）
2. **システム設定 → プライバシーとセキュリティ** を開き、下部の「セキュリティ」欄に出ている「"BoostRecord" は、Mac を保護するためにブロックされました」の **「このまま開く」** をクリック
3. 確認ダイアログで **「開く」** → 管理者パスワード / Touch ID で承認

### macOS 14（Sonoma）以前

1. アプリを**右クリック（Control + クリック）→「開く」**
2. 警告ダイアログで **「開く」**

### 「壊れているため開けません」と出る場合

古いバージョンのビルドで出ることがあります（最近のビルドは整合性シール = ad-hoc 署名付きのため通常出ません）。ターミナルで次を実行してから開いてください。

```bash
xattr -cr "/Applications/BoostRecord.app"
```

> ダイアログの文言は macOS のバージョンにより多少異なります。

## Windows での開き方

1. `BoostRecord-Setup-<ver>.exe` を実行
2. 「**Windows によって PC が保護されました**」（Microsoft Defender SmartScreen）が出たら **「詳細情報」→「実行」**
3. インストーラの指示に従う（インストール先は変更可能）
4. スタートメニュー / デスクトップから起動

SmartScreen は「このファイルのダウンロード実績が少ない」ことによる警告のため、**リリース直後ほど出やすくなります**。バージョンごとに実績はリセットされるので、更新のたびに出るのは正常です。

> 会社支給 PC などで組織のポリシーにより「実行」ボタンが出ない場合は、管理者に相談するか、署名対応後のリリースをお待ちください。

## ファイルの真正性を確認する（任意・上級者向け）

各リリースには electron-builder が生成する `latest.yml`（Windows）/ `latest-mac.yml`（macOS）が添付されており、各ファイルの **SHA-512 ハッシュ（Base64）** が `sha512:` として記載されています。手元のファイルのハッシュと突き合わせると、破損・すり替えがないことを確認できます。

macOS:

```bash
openssl dgst -sha512 -binary BoostRecord-<ver>-arm64.dmg | openssl base64 -A
```

Windows（PowerShell）:

```powershell
$f = Resolve-Path .\BoostRecord-Setup-<ver>.exe
[Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash([System.IO.File]::ReadAllBytes($f)))
```

出力が `latest*.yml` 内の該当ファイルの `sha512:` と一致すれば OK です。

## FAQ

- **これはウイルスですか?** — いいえ。署名証明書が無いため OS が開発元を確認できず、一律に警告しているだけです。ソース・ビルド工程・検証体制はすべて公開されており、上記のハッシュ照合で配布物とビルド成果物の一致も確認できます
- **なぜ署名しないのですか?** — 証明書の取得・維持に費用と審査が必要なためです（Apple Developer Program は $99/年）。OSS 向け無料署名（SignPath Foundation）と Apple 公証への対応を進めています
- **いつ警告が消えますか?** — 署名対応後のリリースから消える見込みです。それまでは本ページの手順をお願いします
