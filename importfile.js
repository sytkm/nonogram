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
            //　読み込んだファイルをuint8arrayに入れる
            const src = reader.result;
            const binary = atob(src.split(',')[1]);
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
            const tRNSdata = splitChunk.filter(x => x.chunkType === 'tRNS')[0].chunkData[0];

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
            console.log(pngmatrix);

            // 遊ぶための空のマトリクスを作成
            for (let i = 0; i < pngmatrix.length; i++) {
                const row = [];
                for (let j = 0; j < pngmatrix[i].length; j++) {
                    row.push(tRNSdata);
                }
                g_drawmatrix.push(row);
            }
            // パレットの読み込み
            const pngpalettecolor = paletteColor(splitChunk.filter(x => x.chunkType === 'PLTE')[0].chunkData);

            // デフォルト色を背景色で設定
            g_selectcolor = tRNSdata;

            // 使ってる色のパレット番号の取り出し
            const pngpalettecolorset = new Set(Array.prototype.concat.apply([], pngmatrix));

            // nonogramの数字の計算
            const numberrow = makeNumber(pngmatrix, tRNSdata);
            const numbercolumn = makeNumber(transpose(pngmatrix), tRNSdata);

            // 描画
            draw(pngmatrix, pngpalettecolor, pngpalettecolorset,numberrow,numbercolumn,tRNSdata);

        };
    }, false);
}

// 描画関数
function draw(pngmatrix, pngpalettecolor, pngpalettecolorset,numberrow,numbercolumn,tRNSdata){
    const canvas = document.getElementById('canvas');
    canvas.width = pngmatrix.length * g_css + numberrow[1] * g_css;
    canvas.height = pngmatrix[0].length * g_css + numbercolumn[1] * g_css;

    // パレットの描画
    drawPalette(pngpalettecolor, pngpalettecolorset);

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

// PNGチャンク読み取り関数
function readChunk(source) {
    const chunklength = new Uint32Array(source.slice(0, 4).reverse().buffer)[0];
    const chunktype = Array.from(source.slice(4, 8), e => String.fromCharCode(e)).join("");
    const chunkdata = source.slice(8, 8 + chunklength);
    const chunkcrc = source.slice(8 + chunklength, 12 + chunklength);
    return { chunkLength: chunklength, chunkType: chunktype, chunkData: chunkdata, chunkCRC: chunkcrc };
}

// PNGマトリクス生成関数
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

// ビット深度調整関数
function optimizeData(source, bitdepth) {
    const optimizeData = [];
    for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < 8 / bitdepth; j++) {
            optimizeData.push((source[i] >> bitdepth * (8 / bitdepth - j - 1)) & (2 ** bitdepth - 1));
        }
    }
    return optimizeData;
}

// Nonogram数字計算関数
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

// Nonogram数字マトリクス生成関数
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

// Nonogram行数字マトリクス描画関数
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

// Nonogram列数字マトリクス描画関数
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

// PNG描画関数
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

// Nonogramキャンバス描画関数
function drawCanvasfromBinary(canvas, arr, palette, alpha, offset) {
    const context = canvas.getContext('2d');

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
        [j, i] = [Math.floor(x / g_css), Math.floor(y / g_css)];
        drawSelectColor(i, j);
        g_drawmatrix[i][j] = g_selectcolor;
    }, false);

    // マスの色を塗る関数
    function drawColor(i, j) {
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0] + g_css * j, offset[1] + g_css * i, g_css, g_css);
        context.fillStyle = `rgb(${palette[arr[i][j]]})`;
        if (arr[i][j] === alpha) {
            context.fillStyle = `rgb(255,255,255)`;
        }
        context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
    }

    // 選択したマスの色を塗る関数
    function drawSelectColor(i, j) {
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0] + g_css * j, offset[1] + g_css * i, g_css, g_css);
        context.fillStyle = `rgb(${palette[g_selectcolor]})`;
        context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
    }
}

// PNGパレット描画関数
function drawPalette(sourcepalette, usecolor) {
    const mag = 4;
    const canvas = document.getElementById('paletteCanvas');
    const context = canvas.getContext('2d');
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            drawPaletteColor(i, j, true);
        }
    }
    const saved_pallete = context.getImageData(0, 0, mag * 4 * 16, mag * 3 * 16);

    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        [j, i] = [Math.floor(x / (mag * 4)), Math.floor(y / (mag * 3))];
        context.putImageData(saved_pallete, 0, 0);
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

// PNGパレット生成関数
function paletteColor(source) {
    const palette = [];
    for (i = 0; i < source.length / 3; i++) {
        palette.push([source[3 * i], source[3 * i + 1], source[3 * i + 2]]);
    }
    return palette;
}

// 背景色から文字色を決める関数
// https://katashin.info/2018/12/18/247
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

// 行列転置関数
// https://qiita.com/kznr_luk/items/790f1b154d1b6d4de398
function transpose(arr) {
    return arr[0].map((_, c) => arr.map(r => r[c]))
}

// ASCII文字hex変換関数
function hex(s) {
    const result = "";
    for (let i = 0; i < s.length; ++i) {
        const h = ("0" + s.charCodeAt(i).toString(16)).slice(-2);
        result += h;
    }
    return result;
}