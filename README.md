# nonogram
PNGからNonogramを作成する

## テスト
Node.jsがインストールされた環境で、次のコマンドを実行します。
追加のパッケージのインストールは不要です。

```sh
node --test tests/png-matrix.test.cjs
```

1・2・4・8bitのPNG行データについて、画像の幅と画素の値が保たれることを確認します。
このテストはフィルター方式0の行データを対象とし、PNG読み込み全体を検証するものではありません。

## License
Copyright (c) 2019-2021 sytkm Released under the MIT license http://opensource.org/licenses/mit-license.php
