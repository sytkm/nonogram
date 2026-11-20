// Nonogramの生成ファイル

// 選択色
let g_selectcolor = 0;

// 描画したマトリクス
let g_drawmatrix = [];

// キャンバスの拡大倍率
// canvas scale size 
let g_css = 10;

// 5×5の十字を描いたパレット形式のサンプルPNG。
const samplePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAMAAAC6sdbXAAAABlBMVEX///8wW6NnOUAjAAAAFUlEQVR4nGNgYGBkAAEQyQgCDEgiAAClAAqu0sLdAAAAAElFTkSuQmCC';

window.onload = function () {
    setupImagePicker();

    const query = window.location.search;
    if (!query) return;

    try {
        if (query === '?sample') {
            startPuzzle(decodeLegacyPng(samplePNG), { sample: true });
        } else {
            startPuzzle(decodeLegacyPng(decodeURIComponent(query.slice(1))), { shared: true });
        }
    } catch {
        document.getElementById('image-status').textContent =
            '共有された問題を開けませんでした。リンクを確認するか、画像を選んで新しく作れます。';
    }
};

function setupImagePicker() {
    const input = document.getElementById('file');
    const status = document.getElementById('image-status');
    const preview = document.getElementById('image-preview');
    const canvas = document.getElementById('preview-canvas');
    const threshold = document.getElementById('threshold');
    const color = document.getElementById('play-color');
    let currentImage;

    function updatePreview() {
        if (!currentImage) return;
        const matrix = makeMonochromeMatrix(currentImage.imageData, Number(threshold.value));
        currentImage.matrix = matrix;
        document.getElementById('threshold-value').value = threshold.value;
        canvas.width = matrix[0].length;
        canvas.height = matrix.length;
        canvas.style.width = canvas.width * 8 + 'px';
        const context = canvas.getContext('2d');
        matrix.forEach((row, y) => row.forEach((value, x) => {
            context.fillStyle = value ? '#000' : '#fff';
            context.fillRect(x, y, 1, 1);
        }));
    }

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        currentImage = { file };
        const selection = currentImage;
        preview.hidden = true;
        status.textContent = '画像を読み込んでいます…';
        try {
            const image = await readPuzzleImage(file);
            if (currentImage !== selection) return;
            Object.assign(selection, image);
            threshold.value = '128';
            updatePreview();
            document.getElementById('preview-size').textContent =
                image.imageData.width + ' × ' + image.imageData.height + ' マス（最長辺30マスまで）';
            color.hidden = !image.canPlayLegacyColor;
            preview.hidden = false;
            status.textContent = '';
        } catch (error) {
            if (currentImage !== selection) return;
            currentImage = undefined;
            input.value = '';
            status.textContent = error.message;
        }
    });

    threshold.addEventListener('input', updatePreview);
    document.getElementById('play-monochrome').addEventListener('click', () => {
        if (!currentImage?.matrix) return;
        startPuzzle({
            matrix: currentImage.matrix,
            palette: [[255, 255, 255], [0, 0, 0]],
            blank: 0,
        }, { monochrome: true });
    });
    color.addEventListener('click', async () => {
        const selection = currentImage;
        if (!selection?.canPlayLegacyColor) return;
        color.disabled = true;
        try {
            const src = await readBase64(selection.file);
            if (currentImage !== selection || document.getElementById('start-panel').hidden) return;
            startPuzzle(decodeLegacyPng(src), { shareSource: src });
        } catch {
            if (currentImage !== selection) return;
            status.textContent = 'カラー問題を作れませんでした。白黒問題で遊ぶか、別の画像を選んでください。';
        } finally {
            color.disabled = false;
        }
    });
}

function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// 既存のパレット形式PNGと共有リンク向けの読み込み。
function decodeLegacyPng(src) {
    const bytes = Uint8Array.from(atob(src), char => char.charCodeAt(0));
    if (detectImageFormat(bytes) !== 'png') throw new Error('PNGではありません。');

    const chunks = [];
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const chunk = readChunk(bytes.subarray(offset));
        offset += chunk.chunkLength + 12;
        if (offset > bytes.length) throw new Error('PNGのデータが途中で切れています。');
        chunks.push(chunk);
        if (chunk.chunkType === 'IEND') break;
    }

    const find = type => chunks.find(chunk => chunk.chunkType === type)?.chunkData;
    const header = find('IHDR');
    const colors = find('PLTE');
    const compressed = find('IDAT');
    if (header?.length !== 13 || header[9] !== 3 || header[12] !== 0 || !colors || !compressed) {
        throw new Error('対応していないカラーPNGです。');
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(0);
    const height = view.getUint32(4);
    const bitDepth = header[8];
    if (!width || !height || ![1, 2, 4, 8].includes(bitDepth)) {
        throw new Error('PNGの寸法またはビット深度が不正です。');
    }

    const pixels = new Zlib.Inflate(compressed).decompress();
    if (pixels.length !== height * (1 + Math.ceil(width * bitDepth / 8))) {
        throw new Error('PNGの画素数が画像サイズと一致しません。');
    }
    return {
        matrix: makePNGMatrix(pixels, width, height, bitDepth),
        palette: paletteColor(colors),
        blank: find('tRNS')?.[0] ?? 0,
    };
}

function startPuzzle({ matrix, palette, blank }, options = {}) {
    g_drawmatrix = matrix.map(row => row.map(() => 0));
    const usedColors = new Set(options.monochrome ? [1, 0] : matrix.flat());
    g_selectcolor = usedColors.values().next().value;
    const rowClues = makeNumber(matrix, blank);
    const columnClues = makeNumber(transpose(matrix), blank);

    if (options.monochrome) {
        const longestSide = Math.max(matrix.length + columnClues[1], matrix[0].length + rowClues[1]);
        g_css = Math.max(10, Math.min(40, Math.floor(500 / longestSide)));
    } else {
        g_css = options.sample ? 40 : Math.max(Math.round(500 / (matrix.length + columnClues[1])), 10);
    }

    draw(matrix, palette, usedColors, rowClues, columnClues, blank);
    document.getElementById('start-panel').hidden = true;
    document.getElementById('play-panel').hidden = false;
    document.getElementById('pixelcanvas').hidden = false;
    document.getElementById('fix-phone-under-menu').hidden = false;

    const share = document.getElementById('share');
    share.hidden = !options.shareSource;
    if (options.shareSource) {
        const puzzleURL = new URL(window.location.href);
        puzzleURL.search = encodeURIComponent(options.shareSource);
        puzzleURL.hash = '';
        const shareURL = new URL('https://twitter.com/share');
        shareURL.searchParams.set('url', puzzleURL.href);
        shareURL.searchParams.set('text', 'このNonogramが解けるかな？');
        share.href = shareURL.href;
    }

    const download = document.getElementById('downl');
    download.hidden = options.shared === true;
    document.getElementById('solve').hidden = options.shared === true;
    download.onclick = () => {
        const link = document.createElement('a');
        link.href = document.getElementById('canvas').toDataURL('image/png');
        link.download = 'nonogram.png';
        link.click();
    };
    document.getElementById('check').onclick = () => {
        const solved = checkNumber(rowClues, g_drawmatrix, blank) &&
            checkNumber(columnClues, transpose(g_drawmatrix), blank);
        alert(solved ? '正解！' : 'まだ一致していません。');
    };
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
    //背景を白に
    const context = canvas.getContext('2d');
    context.fillStyle = "rgb(255,255,255)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font= `${g_css}px Arial`;


    // パレットの描画
    //drawPalette(pngpalettecolor, pngpalettecolorset);
    drawUnderPalette(pngpalettecolor, pngpalettecolorset,tRNSdata);

    // キャンバスの描画
    //drawCanvasfromBinary(canvas,pngmatrix,pngpalettecolor,tRNSdata,[numberrow[1]*g_css,numbercolumn[1]*g_css]);
    drawCanvasfromBinary(canvas, g_drawmatrix, pngpalettecolor, tRNSdata, [numberrow[1] * g_css, numbercolumn[1] * g_css]);

    // 縦と横の数字の描画
    drawNumberRow(canvas, numberrow[0], pngpalettecolor, numbercolumn[1] * g_css);
    drawNumberColumn(canvas, numbercolumn[0], pngpalettecolor, numberrow[1] * g_css);

    // 解答
    document.getElementById('solve').onclick = () => {
        g_drawmatrix = pngmatrix.map(row => row.slice());
        drawCanvasfromBinary(canvas, g_drawmatrix, pngpalettecolor, tRNSdata, [numberrow[1] * g_css, numbercolumn[1] * g_css]);
    };
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
    const depthwidth = Math.ceil(pngwidth / (8 / bitdepth));
    for (let i = 0; i < pngheight; i++) {
        let row = Array.from(data.slice((depthwidth + 1) * i + 1, (depthwidth + 1) * (i + 1)));
        if (bitdepth < 8) {
            row = optimizeData(row, bitdepth);
        }
        // ビット展開で生じた行末の余白を、画像の幅に合わせて取り除く。
        pngmatrix.push(row.slice(0, pngwidth));
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
 * @param  {Number[]} arr - 数字 データ
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
 * Nonogramマトリクスチェック関数
 * @param  {Number[][],Number} checkarr - チェック用の数字配列
 * @param  {Number[][]} targetmatrix - チェックする配列
 * @param  {Number} alpha - 透過色
 * @return {Boolean} - 合っているか間違っているか
 */
function checkNumber(checkarr, targetmatrix, alpha) {
    return String(checkarr) === String(makeNumber(targetmatrix, alpha));
}

/**
 * Nonogram数字マトリクス生成関数
 * @param  {Number[][]} arr - pngマトリクス
 * @param  {Number} alpha - 透過色
 * @return {Number[][],Number}- 計算した数字集合、最大値
 */
function makeNumber(arr, alpha) {
    const numberrowarray = [];
    let maxnumber = 0;
    for (let i = 0; i < arr.length; i++) {
        let calcnum = calcNumber(arr[i]);
        calcnum = calcnum.filter(x => (x[0] !== alpha)&&(x[0] !== -1));
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
            context.fillStyle = chooseTextColor(...palette[arr[i][j][0]]);
        } else {
            context.fillStyle = `rgb(0,0,0)`;
        }
        context.fillText(`${arr[i][j][1]}`, g_css * j, g_css * i + g_css + offset, g_css);
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
            context.fillStyle = chooseTextColor(...palette[arr[i][j][0]]);
        } else {
            context.fillStyle = `rgb(0,0,0)`;
        }
        context.fillText(`${arr[i][j][1]}`, g_css * i + offset, g_css * j + g_css, g_css);
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

    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[0].length; j++) {
            drawColor(i, j);
        }
    }

    // ヒント欄を除き、盤面内のマスだけ塗る。
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const column = Math.floor((e.clientX - rect.left - offset[0]) / g_css);
        const row = Math.floor((e.clientY - rect.top - offset[1]) / g_css);
        if (row < 0 || row >= arr.length || column < 0 || column >= arr[0].length) return;
        drawSelectColor(row, column);
        g_drawmatrix[row][column] = g_selectcolor;
    };

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
        if(g_selectcolor>=0){
            context.fillStyle = `rgb(${palette[g_selectcolor]})`;
            if (g_selectcolor === alpha) {
                context.fillStyle = `rgb(255,255,255)`;
            }
            context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
        }else{
            context.fillStyle = `rgb(255,255,255)`;
            context.fillRect(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1, g_css - 2, g_css - 2);
            context.beginPath();
            context.strokeStyle = `rgb(0,0,0)`;  
            context.moveTo(offset[0] + g_css * j + 1 + g_css - 2, offset[1] + g_css * i + 1);
            context.lineTo(offset[0] + g_css * j + 1, offset[1] + g_css * i + 1 + g_css - 2);
            context.lineWidth = 1;
            context.stroke();
        }
    }
}

/**
 * PNGパレット描画関数
 * @deprecated
 * @param  {} sourcepalette
 * @param  {} usecolor
 */
function drawPalette(sourcepalette, usecolor,alpha) {
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
function drawUnderPalette(sourcepalette, usecolor, alpha) {
    const useset = Array.from(usecolor);
    const mag = 40;
    const canvas = document.getElementById('underPalette');
    canvas.width = (useset.length + 1) * (mag + 10);
    canvas.height = 50;

    const context = canvas.getContext('2d');
    for (let i = 0; i < useset.length; i++) {
        drawPaletteColor(i, true);
    }
    drawPaletteColor(useset.length,true);

    const saved_palette = context.getImageData(0, 0, canvas.width, canvas.height);
    // デフォルトを選択状態にする
    drawPaletteColor(0, false);

    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        i = Math.floor(x / (mag + 10));
        context.putImageData(saved_palette, 0, 0);
        drawPaletteColor(i, false);
        if(i<useset.length){
            g_selectcolor = useset[i];
        }else{
            g_selectcolor = -1;
        }
    }, false);

    /**
     * パレットの色を塗る
     * @param  {} i
     * @param  {} def
     */
    function drawPaletteColor(i, def) {
        context.fillStyle = def ? 'rgb(128,128,128)' : 'rgb(255,255,0)';
        context.fillRect((mag + 10) * i, 5, mag, mag);

        if(i<useset.length){
            context.fillStyle = `rgb(${sourcepalette[useset[i]]})`;
            if (useset[i] === alpha) {
                context.fillStyle = `rgb(255,255,255)`;
            }
            context.fillRect((mag + 10) * i + 4, 5 + 4, mag - 8, mag - 8);
        }else{
            context.fillStyle = `rgb(255,255,255)`;
            context.fillRect((mag + 10) * i + 4, 5 + 4, mag - 8, mag - 8);
            context.beginPath();
            context.strokeStyle = `rgb(0,0,0)`;  
            context.moveTo((mag + 10) * i + 4 + mag - 8, 5 + 4);
            context.lineTo((mag + 10) * i + 4, 5 + 4 + mag - 8);
            context.lineWidth = 1;
            context.stroke();
        }
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
