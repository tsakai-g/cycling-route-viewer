# Route Atlas — Cycling GPS Viewer

FIT / GPX のサイクリング記録を、地図上で一覧・検索・重ね合わせ表示し、クリックした地点のGoogleストリートビューを開ける **local-first** の静的 Web アプリです。独自サーバー不要で GitHub Pages にそのまま配置できます。

[![App: Route Atlas](assets/favicon.svg)](https://tsakai-g.github.io/cycling-route-viewer/)

## デモでできること

- 起動時に **7件の架空のサイクリング経路**を表示（実在する道路の再現ではありません）。
- `.fit` / `.gpx` を**複数選択・フォルダ選択・ドラッグ＆ドロップ**で追加。
- 名前検索・走行年・ファイル形式で絞り込み、チェックボックスで表示経路を切り替え。
- 地図で経路をクリックして選択、または一覧から選択してその経路をズーム表示。
- **ストリートビュー連携**：地図の任意の地点や走行経路をクリック → 座標付きマーカーとポップアップ → 「Googleストリートビューで開く」を選ぶと別タブで表示。通常のGoogleマップへのリンクも付属。
- 距離・走行日・経過時間・元の GPS 点数を表示。
- 表示中の経路を **GeoJSON** に出力。
- 読み込んだ記録はブラウザの **IndexedDB** に保存し、再訪時に復元。

## ストリートビューを使う

1. 地図上の任意の場所、または表示されている走行経路をクリックします。
2. クリック地点にオレンジ色のマーカーが現れ、緯度・経度がポップアップに表示されます。
3. **Googleストリートビューで開く ↗** を押すと新しいタブでGoogleストリートビューを開きます。
4. 撮影データがない場合はその地点のストリートビューが利用できません。補助リンク **Googleマップで地点を見る ↗** を利用できます。
5. **地点を解除 ×** でマーカーを消せます。地図で別の場所をクリックするとマーカーが移動します。

リンクの生成にはGoogle公式の Maps URL 仕様 `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=緯度,経度` を用います。**Google Maps APIキーは不要**です。指定座標の最も近いパノラマを開くため、厳密に同じ地点で撮影された画像とは限りません。

## GitHub Pages への公開（最も簡単）

公開手順のみの資料：**[GITHUB_PAGES.md](GITHUB_PAGES.md)**

1. GitHub で公開用リポジトリ `cycling-route-viewer` を作成します（この例では空のリポジトリを選択）。
2. このフォルダのファイル・ディレクトリをリポジトリのルートにアップロード／コミットします。**ZIP ファイルそのものをアップロードするのではなく、展開後の中身**を登録します。
3. GitHub のリポジトリで **Settings → Pages → Build and deployment** に進みます。
4. **Source: Deploy from a branch**、**Branch: main**、**Folder: /(root)** を指定し **Save** します。
5. 公開ページは通常 `https://<username>.github.io/cycling-route-viewer/` となります。

Git でアップロードする場合（空のリポジトリを作成済み）：

```bash
cd cycling-route-viewer
git init
git add .
git commit -m "Initial Route Atlas demo"
git branch -M main
git remote add origin https://github.com/USERNAME/cycling-route-viewer.git
git push -u origin main
```

> `USERNAME` はご自身の GitHub ユーザー名に置き換えてください。公開前に `git status` を確認してください。 `.gitignore` により一般的な `.fit` / `.gpx` / `.geojson` ファイルは誤ってコミットされにくいようにしていますが、完全な機密情報検査の代わりにはなりません。

## ローカル起動（重要：OpenStreetMapの403対策）

**Windowsなら `run-local.cmd` をダブルクリックして起動してください。** Python 3がインストールされていれば、自動でローカルHTTPサーバーが起動し、`http://127.0.0.1:8000/` をブラウザで開きます。アプリの使用中は起動したコマンドプロンプト画面を閉じないでください。閉じるとサーバーが停止します。初回起動でPythonが見つからない場合は下記の手動起動を参照してください。

**注意：`local-preview.html` を直接ダブルクリックする方式は現在のOpenStreetMapタイル配信ポリシーに対応できません。** ブラウザで `file://` のHTMLを開くとHTTP `Referer` ヘッダーを送れず、地図の代わりに「403 Access blocked」が出ます。そのため、今回のバージョンでは `local-preview.html` からの地図タイル取得を停止し、画面内に起動案内を出します。GPSログやアプリの不具合ではありません。

手動で起動する場合はZIPを展開したフォルダでPowerShellまたはターミナルを開き、次を実行してください。

```bash
# WindowsでPython Launcherがある場合
py -m http.server 8000 --bind 127.0.0.1

# または、その他のOS・環境
python -m http.server 8000 --bind 127.0.0.1
```

その後、Chrome/Edgeで **http://127.0.0.1:8000/** を開いてください。`127.0.0.1` は利用中のPC自身を示し、外部にWebアプリを公開するものではありません。ブラウザが標準設定なら、地図リクエストに必要なHTTP `Referer` が送信されます。**背景地図の読み込みにはインターネット接続が必要です。**

地図タイルがまだ拒否される場合は、ブラウザのトラッキング防止機能や拡張機能によって `Referer` が削除されていないか確認してください。OSMのタイル利用ポリシーを回避するために、ブラウザのUser-Agentを偽装したり、大量のタイルを事前取得したりしないでください。

`index.html` はES Modulesを使用するため、直接ダブルクリックで起動するのではなく上記のHTTPサーバー経由で開いてください。GitHub Pagesに公開されたページは通常のHTTPSオリジンから表示されます。

開発時はNode.jsを使用できます。

```bash
npm test
npm run build:local   # 「直接開くと起動案内が出る」単独HTMLをソースから再生成
```

**原因の出典**：[OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)、[OpenStreetMap Wiki: Blocked tiles](https://wiki.openstreetmap.org/wiki/Blocked)。

## 技術構成

| 役割 | 実装 | 備考 |
| --- | --- | --- |
| Web | HTML、CSS、JavaScript (ES Modules) | ビルド不要 |
| 地図 | Leaflet 1.9.4 | CDNから読込。Canvas レンダラー |
| 背景地図 | OpenStreetMap タイル | 閲覧中の範囲のタイルを取得 |
| GPX読込 | ブラウザの DOMParser | `trk/trkseg/trkpt`、`rte/rtept` をサポート |
| FIT読込 | JavaScript の軽量FITデコーダー | 一般的な `record` 座標・時刻・高度に対応 |
| 走行距離 | Haversine 距離 | GPS点列から概算 |
| 描画高速化 | Douglas–Peucker簡略化 | 全件表示は簡略化、選択中は詳細点列 |
| ブラウザ保存 | IndexedDB | この端末・ブラウザ・サイトのオリジン単位 |
| 公開 | GitHub Pages | 静的ファイルのみ |
| Street View連携 | Google Maps URLs | `map_action=pano` と `viewpoint` を使用。APIキー不要 |
| 起動用スクリプト | `run-local.cmd` | Windowsでダブルクリックし、HTTPサーバーを起動する |
| 単独HTML | `local-preview.html` | `file://` では地図取得を行わず、起動方法を表示 |

ファイル構成：

```text
cycling-route-viewer/
├── index.html           # UIと画面要素
├── run-local.cmd        # Windowsローカル起動用（推奨）
├── local-preview.html   # file://では起動方法を案内する単独HTML
├── GITHUB_PAGES.md      # GitHub公開専用の手順
├── styles.css           # デザイン／スマートフォン対応
├── src/
│   ├── app.js           # 地図・UI・読込・保存・エクスポート
│   ├── parsers.js       # GPX/FIT解析・GPS距離・点列簡略化
│   └── streetview.js    # Google Maps URL生成と座標検証
├── assets/
│   └── favicon.svg
├── tests/
│   ├── fit-parser.test.js
│   └── streetview.test.js
├── scripts/
│   └── build-local-preview.mjs # 単独HTMLの再生成
├── package.json         # テスト用（公開サイトには不要）
├── .nojekyll            # GitHub PagesでJekyll変換を無効化
├── .gitignore           # 生のGPSログを Git に追加しないようにする
└── README.md
```

## 大量データの扱い

- 解析した経路はGPS点列を保持し、同時に約60mの許容誤差で表示用の簡略化点列を生成します。
- 全件重ね表示には簡略化点列を使い、選択中の1件は元の点列で描画します。
- 数百ファイルの一括選択を想定しています。ただし実機での負荷・IndexedDBの容量上限はファイルのサイズ、GPS点数、ブラウザ、端末により変わります。数百件での実ファイル検証は未実施です。
- インポートの進捗を表示します。実ファイルが極端に大きい場合は処理に時間がかかることがあります。
- 「全件表示」の距離合計は走行ログの重複区間も含めて合計した値です。

## データとプライバシー

- GPSファイルはアプリ内のJavaScriptで処理し、**このプログラムからアップロードAPIに送信しません**。
- 読み込んだ座標・時刻はIndexedDBに保存します。保存データは同じサイトのオリジンに属するスクリプトからアクセス可能なため、管理するGitHubリポジトリと外部ライブラリの安全性を保ってください。
- 背景地図はOpenStreetMapへタイルを取りに行きます。取得先には表示エリアに関するタイル座標やアクセス情報が伝わります。LeafletのCSS/JSもCDNから取得します。
- **Googleへの通信はリンクを押したときのみ**発生します。クリック地点の緯度・経度がGoogleのMaps URLに含まれます。クリック操作だけでGoogle APIへ位置情報を問い合わせるものではありません。
- ブラウザのサイトデータを消す、プライベートウィンドウで使う、端末を変える、といった場合に保存記録が消える可能性があります。**FIT/GPXの原本を別途保持**してください。
- 「GeoJSON出力」には位置情報を含みます。公開・共有に注意してください。
- 架空のデモ経路はアプリコード内で生成しており、個人のログはリポジトリに含めていません。
- OpenStreetMapの公式タイル配信は通常のインタラクティブな閲覧を想定しており、**タイルの一括取得／オフラインの地図配布は禁止**されています。高トラフィックのサービスにするなら適切な提供者のタイルを利用してください。

## 既知の制限と今後の拡張

この配布物は**動作確認用の初期デモ（MVP）**です。

- FITは軽量パーサーによる標準的な位置記録の対応であり、すべての機種・複雑なFITプロファイル・チェーン形式を保証しません。本格運用では **Garmin公式 `@garmin/fitsdk` に置き換え**、手元の異なるデバイスの実ファイルで検証するのが適切です。
- FITデータのCRC整合性チェックは実装していません。ファイル不正・破損に対する厳密な検出が必要ならGarmin SDKを利用してください。
- 走行時間は最初と最後の記録時刻の差（経過時間）であり、停止時間を除いた「移動時間」とは異なります。
- 標高から累積獲得標高を計算する処理は未実装です。
- 複数端末間の同期やバックアップ／復元、重複走行の集約、通った道路のヒートマップは未実装です。
- Google MapsではなくOpenStreetMapを背景にしています。
- ストリートビューの撮影範囲や画像の有無を事前検証する機能はありません。Google側で画像が提供されない地点では利用できません。

### 参照ドキュメント

- [GitHub Pages - ブランチから公開](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Google Maps URLs / Street View（公式仕様）](https://developers.google.com/maps/documentation/urls/get-started#street-view-panorama)
- [Leaflet 1.9 Quick Start](https://leafletjs.com/examples-v1/quick-start/)
- [Garmin FIT SDK (JavaScript)](https://developer.garmin.com/fit/get-the-sdk/)
- [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)

## License

The application's original code in this repository is released under the MIT License (see `LICENSE`). Third-party libraries, fonts, and map tiles remain subject to their respective licenses and usage policies.
