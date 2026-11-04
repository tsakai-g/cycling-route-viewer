# Route Atlas v0.3 のGitHub Pages公開手順

**公開するのはアプリのコードだけ**です。v0.3には架空デモ経路も実GPSログも付属しません。訪問した人はそれぞれ自分のブラウザ内だけでFIT/GPXを読み込みます。

## A. GitHubの画面から公開する場合

1. [GitHub](https://github.com/) にログインし、**New repository** で `cycling-route-viewer` を作成します。一般公開のGitHub Pagesなら **Public** を指定します。
2. `cycling-route-viewer-v0.3.zip` をPCで展開します。
3. リポジトリの **Add file → Upload files** から、展開したフォルダの**中身**（`index.html`, `styles.css`, `src/`, `assets/`など）をアップロードしてコミットします。ZIPそのものをアップロードしてもWebサイトにはなりません。
4. **Settings → Pages → Build and deployment** を開きます。
5. **Source: Deploy from a branch**、Branch: **main**、Folder: **/(root)**、**Save** を指定します。
6. 公開されるURLは通常 `https://USERNAME.github.io/cycling-route-viewer/` です（`USERNAME`を自分のユーザー名に変更）。
7. ブラウザでURLを開き、**初期経路が0件**であること、背景地図を切り替えられることを確認します。GPX/FITを追加して試すときは、公開リポジトリへファイルをアップロードせず、**アプリ画面内の追加ボタン**から読み込みます。

公開まで反映に時間がかかる場合があります。GitHub Pagesの公式手順：[Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## B. Gitで公開する場合（新規リポジトリ）

```bash
git init
git add .
git commit -m "Route Atlas v0.3: topo maps and elevation profiles"
git branch -M main
git remote add origin https://github.com/USERNAME/cycling-route-viewer.git
git push -u origin main
```

既存のGitリポジトリに更新する場合は、ZIPを展開してリポジトリ内の旧ファイルと置き換え、`git add .`・`git commit`・`git push` してください。**`.gitignore`を確認し、FIT/GPX/GeoJSONの原本をコミットしないでください。**

## ローカル動作の確認

- **Windows**：ZIP展開 → **`run-local.cmd`をダブルクリック** → Chrome/Edgeで `http://127.0.0.1:8000/` を開きます（Python 3が必要）。
- **手動**：展開先で `python -m http.server 8000 --bind 127.0.0.1` → 同じURLを開きます。
- `index.html`や`local-preview.html`を直接ダブルクリックして `file://` で開く方式は、地図タイルの403 Access blocked問題を避けるため推奨しません。
- ローカルHTTPとGitHub Pagesではブラウザ保存データが別領域です。サーバーを止めてもIndexedDBはブラウザに残りますが、ブラウザのサイトデータ削除などで消えることがあります。

## 公開データ・地図タイルに関する注意

1. **個人のGPSログを公開リポジトリへ置かない。** 起動直後は経路0件が正常です。
2. OpenStreetMap公式タイルを大量ダウンロードしない。403になる場合、`file://`をやめてHTTP/HTTPSから閲覧する。ブラウザが`Referer`を削っていないか確認する。
3. 国土地理院の地形・標高地図は日本国内向けです。出典は地図上とREADMEに記載しています。地図を公開する際も出典表示を維持してください。
4. 外部アクセス時にページのURLやタイル座標などが地図提供者に渡る場合があります。ストリートビューのリンクを押すと地点座標がGoogleに渡ります。

