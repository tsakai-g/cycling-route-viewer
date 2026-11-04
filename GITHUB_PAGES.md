# Route Atlas を GitHub Pages に公開する

この文書は **v0.2.1（OpenStreetMapタイル403対策版）** に対応しています。アプリの公開にGoogle APIキーや独自サーバーは不要です。

## ブラウザだけで公開する場合

1. [GitHub](https://github.com/) にログインします。
2. 右上の **+ → New repository** をクリックし、リポジトリ名を `cycling-route-viewer` にします。GitHub Pagesを無料で一般公開する想定なら **Public** を選びます。
3. ダウンロードした ZIP を解凍し、展開された `cycling-route-viewer` フォルダ内のファイルとサブフォルダを、リポジトリのルートに **Add file → Upload files** からアップロードしてコミットします。**ZIPのままアップロードしないでください**。
4. リポジトリの **Settings → Pages** を開きます。
5. **Build and deployment** の **Source: Deploy from a branch** を選び、Branchを `main`、Folderを `/(root)` として **Save** します。
6. デプロイ完了後、`https://USERNAME.github.io/cycling-route-viewer/` へアクセスします。`USERNAME` をGitHubのユーザー名に置き換えてください。公開には数分程度の反映時間が発生することがあります。
7. 画面に7件の架空デモ経路が表示されます。地図をクリックし、ポップアップの「Googleストリートビューで開く」を押して動作を確認してください。

## ローカル動作確認で403が出る場合

`local-preview.html` を直接開くと `file://` になるため、OSMの要求する `Referer` を送信できません。**Windowsでは `run-local.cmd` をダブルクリックし、ブラウザで `http://127.0.0.1:8000/` を開いてください。** GitHub PagesはHTTPSオリジンなので、通常のブラウザ設定ならこの問題は発生しません。ブラウザ拡張機能が `Referer` を削除している場合は個別の確認が必要です。詳細はREADMEを参照してください。

## Gitを使う場合

```bash
cd cycling-route-viewer
git init
git add .
git commit -m "Add Street View click-through support"
git branch -M main
git remote add origin https://github.com/USERNAME/cycling-route-viewer.git
git push -u origin main
```

すでにリポジトリがある場合は `git init` と `git remote add origin` は不要です。通常どおり変更ファイルをコミット・プッシュしてください。

## 公開範囲とGPSデータの注意

- プログラムに含まれるデモ経路は **架空のサンプル** です。
- 個人の `.fit`、`.gpx`、エクスポートした `.geojson` をGitHubへコミットしないでください。
- ページを訪問して自分のGPSログを取り込んでも、**本アプリはGPSファイルをサーバーにアップロードしません**。現在のブラウザのIndexedDBに保存します。
- 地図タイルの閲覧時にはOpenStreetMapへネットワーク通信があります。Googleストリートビューのリンクを押した時は、その地点の緯度経度がGoogleのURLへ渡されます。
- GitHub PagesのURLを一般公開すると、誰でもデモ画面とソースを閲覧できます。**閲覧者ごとのログは共有されません**。

参考: [GitHub公式: Pages公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
