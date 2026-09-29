# K's VOX 投稿スタジオ

GBP・SNS用の投稿画像（PNG）とスライドショー動画（MP4）を作る、NOBU先生専用アプリ。

## デプロイナウに登録する環境変数

| 名前 | 内容 |
| --- | --- |
| APP_PASSWORD | アプリを開くときのパスワード（自由に決める） |
| GEMINI_API_KEY | 説明文・ハッシュタグ作成用（Google AI Studioのキー） |
| CF_ACCOUNT_ID | AI画像生成用（CloudflareのアカウントID） |
| CF_API_TOKEN | AI画像生成用（Workers AIの権限を付けたAPIトークン） |

## よく変更しそうな場所

- 画像のレイアウト（文字の太さ・位置・大きさ）：`lib/render.js` の先頭の `STYLE`
- AI画像に自動で加わる雰囲気の指定：`pages/api/image.js` の `KSVOX_STYLE`
- 説明文を書かせるときのルール：`pages/api/caption.js` の `SYSTEM`
- K's VOX資料の初期内容：`lib/defaultDocs.js`（アプリの設定画面からも書き換え可能）
