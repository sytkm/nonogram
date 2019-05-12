## やること
- 画像の取り込み
    - file APIで終わらせたい
- 数字、パレットの表示
    - パレットはバイナリが必要になりそう
    - 数字はあとからcanvasで？
- クリックで遊べるように
    - 拡大必要
    - 毎回一つずつ
- シェア
    - uriをパラメータでやるのが良さそう
## PNG
PNG signature 8byte  
137,80,78,71,13,10,26,10  
IHDR Length 4byte  
0,0,0,13  
IHDR Chunk Type 4byte  
73,72,68,82  
IHDR Chunk Data width 4byte  
W,W,W,W  
IHDR Chunk Data height 4byte  
H,H,H,H  
IHDR Chunk Data bit depth 1byte  
D  
IHDR Chunk Data color type 1byte  
C  

if C == 3 / png use palette


## 参考文献
http://www.landofcrispy.com/nonogrammer/nonogram.html?mode=play
https://www.setsuki.com/hsp/ext/png.htm
https://dawn.hateblo.jp/entry/2017/10/22/205417
https://www.shigemk2.com/entry/2014/09/15/%E6%96%87%E5%AD%97%E5%88%97%E3%82%9216%E9%80%B2%E6%95%B0%E3%81%AB%E5%A4%89%E6%8F%9B%E3%81%97%E3%81%A6%E3%81%BF%E3%82%8B
https://tech-blog.s-yoshiki.com/2018/01/10/
https://developer.mozilla.org/ja/docs/Web/Guide/HTML/Canvas_tutorial/Pixel_manipulation_with_canvas
https://hoshi-sano.hatenablog.com/entry/2013/08/18/112550
https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/DataView
https://qiita.com/megadreams14/items/dded3cf770010bb8ff08
https://developer.mozilla.org/ja/docs/Web/API/FileReader/result
http://var.blog.jp/archives/62330155.html
http://imaya.blog.jp/archives/6136997.html
https://stackoverflow.com/questions/4858187/save-restore-background-area-of-html5-canvas
https://qiita.com/nekoneko-wanwan/items/9af7fb34d0fb7f9fc870
https://katashin.info/2018/12/18/247
https://qiita.com/kznr_luk/items/790f1b154d1b6d4de398
https://rmtmhome.com/under-fixmenu-342