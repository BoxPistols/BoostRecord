# OneDrive でノートを同期する（デスクトップ / Win・Mac）

The Boosters（Boostnote Legacy）のノートは 1 ノート = 1 ファイル（.cson） の
プレーンなファイル集合です。ストレージの保存先フォルダを OneDrive の同期フォルダ配下に
置くだけで、OneDrive クライアントが自動的に複数 PC 間で同期します（アプリ側の追加設定は不要）。

> iPhone からの閲覧・編集は別途 PWA コンパニオン（docs/REQUIREMENTS-pwa-onedrive-2026-07.md）で対応します。
> デスクトップ同士（Win と Mac）はこのページの手順だけで完結します。

## 手順

1. OneDrive クライアントを導入・サインインし、ローカル同期を有効にする。
2. 同期フォルダ内に保存先を作る（両 OS で同じ相対パスに揃えるのを推奨）。例:
   - Windows: %OneDrive%\Apps\Boostnote
   - macOS: ~/Library/CloudStorage/OneDrive-Personal/Apps/Boostnote
     （職場アカウントは OneDrive-会社名。旧構成では ~/OneDrive/Apps/Boostnote）
3. アプリの Preferences → Storages → Add Storage で、上記フォルダを選択して追加。
   - 既存ノートがある場合は、既存ストレージの notes/ attachments/ boostnote.json を
     この OneDrive フォルダにコピーしてから、そのフォルダをストレージとして追加する。
4. 2 台目以降の PC でも、同期済みの同じフォルダを Add Storage で追加すれば同一ノートを共有。

## OS ごとの OneDrive パス検出（自動化する場合の参考）

| OS | 検出方法 |
|---|---|
| Windows | 環境変数 OneDrive / OneDriveConsumer / OneDriveCommercial |
| macOS | ~/Library/CloudStorage/OneDrive-*（新）/ ~/OneDrive（旧） |

## 注意・制約

- 競合: 2 台で同じノートをオフライン同時編集すると、OneDrive がファイル単位で
  「競合コピー（name-PC名.cson）」を作ります。アプリ内マージは行いません（単一ユーザー・
  逐次利用ではほぼ発生しません）。競合コピーが出たら中身を見て手動で残す方を決めてください。
- 添付: attachments/{noteKey}/ 配下の実ファイルも一緒に同期されます。本文は
  :storage/... プレースホルダ参照なので、フォルダごと移動すればリンクは保たれます。
- 保存先の実在チェック: 起動時に存在しないパスのストレージは自動的に外れます
  （browser/main/lib/dataApi/init.js の fs.existsSync）。OneDrive の「オンデマンド／
  ファイルを解放」でプレースホルダ化しても、フォルダ自体が存在すれば問題ありません。
- 同期の実体は OneDrive 側: アプリはローカルフォルダを読み書きするだけで、
  ネットワーク通信・認証は一切行いません（クラウド API 連携は PWA コンパニオン側の責務）。
