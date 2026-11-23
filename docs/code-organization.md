# コードの入口と、変更する場所の目安

最初の実装では、ファイルを開いてPNGのバイト列を調べる処理が `importfile.js` にありました。その後、画像プレビュー、盤面、共有などが加わり、整理前は同じファイルに約2,000行が集まっていました。今は、調べたいことに応じて入口を変えられます。アプリのJavaScriptは `js/` に置き、画像・盤面・問題データ・プレイ進行・共通画面に分けています。

| 調べたいこと | 最初に読むファイル |
| --- | --- |
| サンプルや共有リンクからどの画面を開くか | [`js/app.js`](../js/app.js) |
| 画像がどのように問題やプレビューになるか | [`js/image/image-input.js`](../js/image/image-input.js)、[`js/image/indexed-png.js`](../js/image/indexed-png.js)、[`js/image/image-preview.js`](../js/image/image-preview.js) |
| 問題を開く、再開する、クリアする | [`js/play/puzzle-play.js`](../js/play/puzzle-play.js)。保存形式は [`js/play/progress-store.js`](../js/play/progress-store.js)、分割の一覧は [`js/play/mosaic.js`](../js/play/mosaic.js) |
| マウス・指・キーボードの操作で盤面に何が起きるか | [`js/board/board-controller.js`](../js/board/board-controller.js)。座標計算とジェスチャーは [`js/board/board-gestures.js`](../js/board/board-gestures.js)、画面への描画は [`js/board/board-renderer.js`](../js/board/board-renderer.js) |
| ヒントの数字やクリアの条件をどう判定するか | [`js/puzzle/puzzle-rules.js`](../js/puzzle/puzzle-rules.js)。推理と矛盾検査は [`js/puzzle/line-logic.js`](../js/puzzle/line-logic.js)、一意性の検査は [`js/puzzle/puzzle-quality.js`](../js/puzzle/puzzle-quality.js) |
| どの色を選んでいるか、設定をどこに保存するか | [`js/board/board-palette.js`](../js/board/board-palette.js)、[`js/board/board-settings.js`](../js/board/board-settings.js) |

たとえば列の数字を押すと、入力側が押した位置と操作の種類を決めます。スポイトの場合はパレットが選択色を更新し、チェックの場合は盤面の履歴に記録します。描画側は、結果の色やチェックを読み取ってキャンバスに表示します。描き方を変えるだけなら、履歴や保存形式の知識は要りません。

整理前は選択色がページ全体の変数でした。今はパレットが選択色を持ち、盤面には「選ぶ」と「現在の色を取得する」の2つを渡します。同様に、現在の盤面の描き直し・設定反映・書きかけの操作の確定は、現在の盤面を表すオブジェクトにまとめています。パレットや盤面の中の変数を別画面から直接書き換える必要が減ります。

入力、倍率変更、ヒント、履歴は同じ盤面の状態を取り扱うため、操作側にまとめています。ここを小さく分ける目安は、行数よりも「受け取る値と返す結果を少ない言葉で説明できるか」です。たとえば座標からマスを求める計算や、決まった内容を描く処理は分けやすく、描画イベントごとに新しい仕組みを作る必要はありません。ブラウザ標準のスクリプトと既存のテスト手順を使い続けています。
