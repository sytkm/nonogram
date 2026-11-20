# nonogram
PNG・JPEG・WebPからノノグラムを作成します。画像の変換はブラウザ内で行います。

画像を選ぶと白黒のプレビューが表示されます。明るさの境目を調整し、盤面を確認してから遊べます。最長辺が30マスを超える画像は縦横比を保って縮小します。
従来のパレット形式PNG（インターレースなし）はカラー方式も選べます。

## テスト
Node.jsがインストールされた環境で、次のコマンドを実行します。
追加のパッケージのインストールは不要です。

```sh
node --test tests/*.test.cjs
```

従来のPNG行データの幅と画素の値、白黒変換の明るさと透明度、縮小後のサイズを確認します。
PNGの行データはフィルター方式0が対象です。

## License
Copyright (c) 2019-2021 sytkm Released under the MIT license http://opensource.org/licenses/mit-license.php
