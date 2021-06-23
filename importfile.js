// Nonogramの生成ファイル

// 選択色
let g_selectcolor = 0;

// 描画したマトリクス
const g_drawmatrix = [];

// キャンバスの拡大倍率
// canvas scale size 
const g_css = 10;

window.onload = function () {
    document.getElementById("file").addEventListener("change", function (e) {
        const file = e.target.files;
        const reader = new FileReader();
        // ファイルをDataURIで読み込み
        reader.readAsDataURL(file[0]);

        // ファイルが読み込めたら処理開始
        reader.onload = function () {
            const src = reader.result.split(',')[1];
            main(src);
        };
    }, false);

    if (window.location.search[0] === '?') {
        main(window.location.search.slice(1));
    }

}
/**
 * メイン関数
 * @param  {String} src - 読み込んだファイル
 */
function main(src) {
    console.log(src);
    //　読み込んだファイルをuint8arrayに入れる
    const binary = atob(src);
    const uint8array = Uint8Array.from(binary.split(""), e => e.charCodeAt(0));
    const splitChunk = [];

    // PNGファイルかどうかを確認
    if (JSON.stringify(Array.from(uint8array.slice(0, 8))) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10])) {
        console.log('This file is PNG file');
    } else {
        console.log('This file is not PNG file');
        alert(`This file is not PNG file.
    This file cannot use this service.`);
        return 0;
    }

    // チャンクの読み取り
    for (let i = 8; i < uint8array.length; i += splitChunk.slice(-1)[0].chunkLength + 12) {
        splitChunk.push(readChunk(uint8array.slice(i)));
    }

    console.log(splitChunk);

    //　PNGの縦横サイズ
    const pngwidth = new Uint32Array(splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData.slice(0, 4).reverse().buffer)[0];
    const pngheight = new Uint32Array(splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData.slice(4, 8).reverse().buffer)[0];

    //　読み込みに必要なデータの所得
    const bitdepth = splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData[8];
    const colortype = splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData[9];
    let tRNSdata = 0;
    if (splitChunk.filter(x => x.chunkType === 'tRNS').length !== 0) {
        tRNSdata = splitChunk.filter(x => x.chunkType === 'tRNS')[0].chunkData[0];
    }

    // インタレースを使ってないか確認
    if (splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData[12] === 1) {
        console.log('This PNG file use interlace.');
        alert(`This PNG file use interlace.
    This file cannot use this service.`);
        return 0;
    }
    // パレットを使っているか確認
    if (colortype !== 3) {
        console.log('This PNG file does not used a palette.');
        alert(`This PNG file does not used a palette.
    This file cannot use this service.`);
        return 0;
    }

    // IDATのchunkDataは圧縮されているのでzlibで展開
    const compressed = splitChunk.filter(x => x.chunkType === 'IDAT')[0].chunkData;
    const idatdata = new Zlib.Inflate(compressed).decompress();

    // 読み込まれたPNGのPNGマトリクスの作成
    const pngmatrix = makePNGMatrix(idatdata, pngwidth, pngheight, bitdepth);
    const pngsplitmatrix = splitMatrix(pngmatrix, 16, 16);

    // 遊ぶための空のマトリクスを作成
    for (let i = 0; i < pngmatrix.length; i++) {
        const row = [];
        for (let j = 0; j < pngmatrix[i].length; j++) {
            row.push(0);
        }
        g_drawmatrix.push(row);
    }
    // パレットの読み込み
    const pngpalettecolor = paletteColor(splitChunk.filter(x => x.chunkType === 'PLTE')[0].chunkData);

    // デフォルト色を0番で設定
    g_selectcolor = 0;

    // 使ってる色のパレット番号の取り出し
    const pngpalettecolorset = new Set(Array.prototype.concat.apply([], pngmatrix));

    // nonogramの数字の計算
    const numberrow = makeNumber(pngmatrix, tRNSdata);
    const numbercolumn = makeNumber(transpose(pngmatrix), tRNSdata);

    // 描画
    draw(pngmatrix, pngpalettecolor, pngpalettecolorset, numberrow, numbercolumn, tRNSdata);

    //Twitterシェア(動かない)
    //document.getElementById('share').href = `http://twitter.com/share?url=${window.location.href+"?"+src}&text=このNonogramが解けるかな？&related=sytkm`;

    //canvasダウンロード
    document.getElementById('downl').addEventListener("click", function () {
        const download_canvas = document.getElementById('canvas');
        let link = document.createElement("a");
        link.href = download_canvas.toDataURL("image/png");
        link.download = "nonogram.png";
        link.click();
    });
}


/**
 * Nonogram描画関数
 * @param  {Number[][]} pngmatrix -  読み込んだpngのmatrix 数字はパレット番号
 * @param  {Number[][]} pngpalettecolor - 読み込んだpngのパレット 項番ごとにその色
 * @param  {Set<Number>} pngpalettecolorset - 使っているパレット番号のセット
 * @param  {Number[][],Number} numberrow - rowの数字一覧とその色、最大の数字
 * @param  {Number[][],Number} numbercolumn - columnの数字一覧とその色、最大の数字
 * @param  {Number} tRNSdata - 透過色の番号
 */
function draw(pngmatrix, pngpalettecolor, pngpalettecolorset, numberrow, numbercolumn, tRNSdata) {
    const canvas = document.getElementById('canvas');
    //canvas.width = window.innerWidth;
    //canvas.height = pngmatrix.length * g_css + numbercolumn[1] * g_css;

    canvas.width = pngmatrix[0].length * g_css + numberrow[1] * g_css;
    canvas.height = pngmatrix.length * g_css + numbercolumn[1] * g_css;


    // パレットの描画
    //drawPalette(pngpalettecolor, pngpalettecolorset);
    drawUnderPalette(pngpalettecolor, pngpalettecolorset);

    // キャンバスの描画
    //drawCanvasfromBinary(canvas,pngmatrix,pngpalettecolor,tRNSdata,[numberrow[1]*g_css,numbercolumn[1]*g_css]);
    drawCanvasfromBinary(canvas, g_drawmatrix, pngpalettecolor, tRNSdata, [numberrow[1] * g_css, numbercolumn[1] * g_css]);

    // 縦と横の数字の描画
    drawNumberRow(canvas, numberrow[0], pngpalettecolor, numbercolumn[1] * g_css);
    drawNumberColumn(canvas, numbercolumn[0], pngpalettecolor, numberrow[1] * g_css);

    // 解答
    document.getElementById('solve').addEventListener("click", function () {
        drawCanvasfromBinary(canvas, pngmatrix, pngpalettecolor, tRNSdata, [numberrow[1] * g_css, numbercolumn[1] * g_css]);
    });
}

/**
 * PNGチャンク読み取り関数
 * @param  {String} source - バイナリファイル
 * @return {Object} - chunk読み取りデータ サイズ/タイプ/データ/終値
 */
function readChunk(source) {
    const chunklength = new Uint32Array(source.slice(0, 4).reverse().buffer)[0];
    const chunktype = Array.from(source.slice(4, 8), e => String.fromCharCode(e)).join("");
    const chunkdata = source.slice(8, 8 + chunklength);
    const chunkcrc = source.slice(8 + chunklength, 12 + chunklength);
    return { chunkLength: chunklength, chunkType: chunktype, chunkData: chunkdata, chunkCRC: chunkcrc };
}

/**
 * PNGマトリクス生成関数
 * @param  {String} data - chunkデータ
 * @param  {number} pngwidth - pngファイルの幅
 * @param  {Number} pngheight - pngファイルの高さ
 * @param  {Number} bitdepth - ビット深度
 * @return {Number[][]} - pngマトリクス 中身はパレット番号
 */
function makePNGMatrix(data, pngwidth, pngheight, bitdepth) {
    const pngmatrix = [];
    const depthwidth = pngwidth / (8 / bitdepth);
    for (let i = 0; i < pngheight; i++) {
        let row = Array.from(data.slice((depthwidth + 1) * i + 1, (depthwidth + 1) * (i + 1)));
        if (bitdepth < 8) {
            row = optimizeData(row, bitdepth);
        }
        pngmatrix.push(row);
    }
    return pngmatrix;
}

/**
 * ビット深度調整関数
 * @param  {String[]} source - pngの行データ(string)
 * @param  {Number} bitdepth - ビット深度
 * @return {Number[]} pngの行データ
 */
function optimizeData(source, bitdepth) {
    const optimizeData = [];
    for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < 8 / bitdepth; j++) {
            optimizeData.push((source[i] >> bitdepth * (8 / bitdepth - j - 1)) & (2 ** bitdepth - 1));
        }
    }
    return optimizeData;
}

/**
 * Nonogram数字計算関数
 * @param  {Number[]} arr - 数字データ
 * @return {Number[][]} 連続する数字のデータ
 */
function calcNumber(arr) {
    const calculated = [[arr[0], 1]];
    for (let i = 1; i < arr.length; i++) {
        if (calculated.slice(-1)[0][0] === arr[i]) {
            calculated.slice(-1)[0][1]++;
        } else {
            calculated.push([arr[i], 1]);
        }
    }
    return calculated;
}

/**
 * Nonogram数字マトリクス生成関数
 * @param  {Number[][]} arr - pngマトリクス
 * @param  {Number} alpha - 透過色
 * @return - 計算した数字集合、最大値
 */
function makeNumber(arr, alpha) {
    const numberrowarray = [];
    let maxnumber = 0;
    for (let i = 0; i < arr.length; i++) {
        let calcnum = calcNumber(arr[i]);
        calcnum = calcnum.filter(x => x[0] !== alpha);
        if (calcnum.length === 0) {
            calcnum.push([-1, 0]);
        }
        numberrowarray.push(calcnum);
        maxnumber = Math.max(maxnumber, calcnum.length);
    }
    return [numberrowarray, maxnumber];
}

/**
 * Nonogram行数字マトリクス描画関数
 * @param  {HTMLElement} canvas - 描画するcanvas
 * @param  {Number[][]} arr - 描画するNonogram数字マトリクス
 * @param  {Number[][]} palette - パレット
 * @param  {Number} offset - オフセット
 */
function drawNumberRow(canvas, arr, palette, offset) {
    const context = canvas.getContext('2d');
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
            drawNumberColorRow(i, j);
        }
    }
    // マスの色と文字を塗る関数
    function drawNumberColorRow(i, j) {
        if (arr[i][j][0] >= 0) {
            context.fillStyle = `rgb(${palette[arr[i][j][0]]})`;
            context.fillRect(g_css * j, g_css * i + offset, g_css, g_css);
            context.strokeStyle = chooseTextColor(...palette[arr[i][j][0]]);
        } else {
            context.strokeStyle = `rgb(0,0,0)`;
        }
        context.strokeText(`${arr[i][j][1]}`, g_css * j, g_css * i + g_css + offset, g_css);
    }
}

/**
 * Nonogram列数字マトリクス描画関数
 * @param  {HTMLElement} canvas - 描画するcanvas
 * @param  {Number[][]} arr - 描画するNonogram数字マトリクス
 * @param  {Number[][]} palette - パレット
 * @param  {Number} offset - オフセット
 */
function drawNumberColumn(canvas, arr, palette, offset) {
    const context = canvas.getContext('2d');
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
            drawNumberColorColumn(i, j);
        }
    }

    // マスの色と文字を塗る関数
    function drawNumberColorColumn(i, j) {
        if (arr[i][j][0] >= 0) {
            context.fillStyle = `rgb(${palette[arr[i][j][0]]})`;
            context.fillRect(g_css * i + offset, g_css * j, g_css, g_css);
            context.strokeStyle = chooseTextColor(...palette[arr[i][j][0]]);
        } else {
            context.strokeStyle = `rgb(0,0,0)`;
        }
        context.strokeText(`${arr[i][j][1]}`, g_css * i + offset, g_css * j + g_css, g_css);
    }
}

/**
 * PNG描画関数
 * @param  {String} source - 画像ファイル
 */
function drawCanvas(source) {
    const canvas = document.getElementById('canvas');
    if (canvas.getContext) {
        const context = canvas.getContext('2d');
        const image = new Image();
        image.src = source;
        image.onload = function () {
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image, 0, 0);
        };
    }
}

/**
 * Nonogramキャンバス描画関数
 * @param  {HTMLElement} canvas - 描画するcanvas
 * @param  {Number[][]} arr - pngマトリクス
 * @param  {Number[][]} palette - パレット
 * @param  {Number} alpha - 透過色
 * @param  {Number[]} offset - オフセット
 */
function drawCanvasfromBinary(canvas, arr, palette, alpha, offset) {
    const context = canvas.getContext('2d');
    context.fillStyle = "rgb(255,255,255)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[0].length; j++) {
            drawColor(i, j);
        }
    }

    // クリック場所を現在選択した色で塗りつぶす
    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left - offset[0], e.clientY - rect.top - offset[1]];
        if (x > 0 && y > 0) {
            [j, i] = [Math.floor(x / g_css), Math.floor(y / g_css)];
            drawSelectColor(i, j);
            g_drawmatrix[i][j] = g_selectcolor;
        }
    }, false);

    /**
     * マスの色を塗る関数
     * @param  {Number} i y座標
     * @param  {Number} j x座標
     */
    function drawColor(i, j) {
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0] + g_css * j, offset[1] + g_css * i, g_css, g_css);
        context.fillStyle = `rgb(${palette[arr[i][j]]})`;
        if (arr[i][j] === alpha) {
            context.fillStyle = `rgb(255,255,255)`;
        }
        context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
    }

    /**
     * 選択したマスの色を塗る関数
     * @param  {Number} i y座標
     * @param  {Number} j x座標
     */
    function drawSelectColor(i, j) {
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0] + g_css * j, offset[1] + g_css * i, g_css, g_css);
        context.fillStyle = `rgb(${palette[g_selectcolor]})`;
        context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
    }
}

/**
 * PNGパレット描画関数
 * @deprecated
 * @param  {} sourcepalette
 * @param  {} usecolor
 */
function drawPalette(sourcepalette, usecolor) {
    const mag = 4;
    const canvas = document.getElementById('paletteCanvas');
    const context = canvas.getContext('2d');
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            drawPaletteColor(i, j, true);
        }
    }
    const saved_palette = context.getImageData(0, 0, mag * 4 * 16, mag * 3 * 16);

    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        [j, i] = [Math.floor(x / (mag * 4)), Math.floor(y / (mag * 3))];
        context.putImageData(saved_palette, 0, 0);
        drawPaletteColor(i, j, false);
    }, false);

    function drawPaletteColor(i, j, def) {
        if (usecolor.has(i * 16 + j)) {
            context.fillStyle = def ? 'rgb(128,128,128)' : 'rgb(255,255,0)';
            context.fillRect(mag * 4 * j, mag * 3 * i, mag * 4, mag * 3);
        }
        if (!def) {
            g_selectcolor = i * 16 + j;
        }
        context.fillStyle = `rgb(${sourcepalette[i * 16 + j]})`;
        context.fillRect(mag * 4 * j + 1, mag * 3 * i + 1, mag * 4 - 2, mag * 3 - 2);
    }
}

/**
 * PNGパレット描画関数
 * @param  {Number[][]} sourcepalette - パレット
 * @param  {Set<Number>} usecolor - パレットの中で使っている色集合
 */
function drawUnderPalette(sourcepalette, usecolor) {
    const useset = Array.from(usecolor);
    const mag = 40;
    const canvas = document.getElementById('underPalette');
    canvas.width = useset.length * (mag + 10);
    canvas.height = 50;

    const context = canvas.getContext('2d');
    for (let i = 0; i < useset.length; i++) {
        drawPaletteColor(i, true);
    }
    const saved_palette = context.getImageData(0, 0, canvas.width, canvas.height);

    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        i = Math.floor(x / (mag + 10));
        context.putImageData(saved_palette, 0, 0);
        drawPaletteColor(i, false);
        g_selectcolor = useset[i];
    }, false);

    /**
     * パレットの色を塗る
     * @param  {} i
     * @param  {} def
     */
    function drawPaletteColor(i, def) {
        context.fillStyle = def ? 'rgb(128,128,128)' : 'rgb(255,255,0)';
        context.fillRect((mag + 10) * i, 5, mag, mag);

        context.fillStyle = `rgb(${sourcepalette[useset[i]]})`;
        context.fillRect((mag + 10) * i + 4, 5 + 4, mag - 8, mag - 8);
    }
}

/**
 * PNGパレット生成関数
 * @param  {Number[]} source - パレットのデータ 数字が3つずつ並んでいる
 * @return {Number[][]} - パレット
 */
function paletteColor(source) {
    const palette = [];
    for (i = 0; i < source.length / 3; i++) {
        palette.push([source[3 * i], source[3 * i + 1], source[3 * i + 2]]);
    }
    return palette;
}

/**
 * 行列分割関数
 * @param  {Number[][]} matrix - 分割する行列
 * @param  {Number} wid - 分割の幅
 * @param  {Number} hei - 分割の高さ
 * @return {Number[][][]} - 分割された行列
 */
function splitMatrix(matrix, wid, hei) {
    const spmatrix = [];
    for (let i = 0; i < matrix.length / hei; i++) {
        const sprowmatrix = [];
        for (let j = 0; j < matrix[i].length / wid; j++) {
            sprowmatrix.push(matrix.map(x => x.slice(j * wid, (j + 1) * wid)).slice(i * hei, (i + 1) * hei));
        }
        spmatrix.push(sprowmatrix);
    }
    return spmatrix;
}


/**
 * 背景色から文字色を決める関数
 * https://katashin.info/2018/12/18/247
 * @param  {Number} red 
 * @param  {Number} green
 * @param  {Number} blue
 * @return {String} 'white'か'blackを返す
 */
function chooseTextColor(red, green, blue) {
    // sRGB を RGB に変換し、背景色の相対輝度を求める
    const toRgbItem = item => {
        const i = item / 255
        return i <= 0.03928 ? i / 12.92 : Math.pow((i + 0.055) / 1.055, 2.4)
    }
    const R = toRgbItem(red)
    const G = toRgbItem(green)
    const B = toRgbItem(blue)
    const Lbg = 0.2126 * R + 0.7152 * G + 0.0722 * B

    // 白と黒の相対輝度。定義からそれぞれ 1 と 0 になる。
    const Lw = 1
    const Lb = 0

    // 白と背景色のコントラスト比、黒と背景色のコントラスト比を
    // それぞれ求める。
    const Cw = (Lw + 0.05) / (Lbg + 0.05)
    const Cb = (Lbg + 0.05) / (Lb + 0.05)

    // コントラスト比が大きい方を文字色として返す。
    return Cw < Cb ? 'black' : 'white'
}

/**
 * 行列転置関数
 * https://qiita.com/kznr_luk/items/790f1b154d1b6d4de398
 * @param  {Number[][]} arr - 入力マトリクス
 * @return {Number[][]} - 転置したマトリクス
 */
function transpose(arr) {
    return arr[0].map((_, c) => arr.map(r => r[c]))
}

/**
 * ASCII文字hex変換関数
 * @param  {String} s - ASCII文字
 * @return {String} - hex
 */
function hex(s) {
    const result = "";
    for (let i = 0; i < s.length; ++i) {
        const h = ("0" + s.charCodeAt(i).toString(16)).slice(-2);
        result += h;
    }
    return result;
}