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
    const side = document.getElementById('puzzle-side');
    const mode = document.getElementById('puzzle-mode');
    const threshold = document.getElementById('threshold');
    const resumeColor = document.getElementById('resume-color');
    const playPreview = document.getElementById('play-preview');
    let currentImage;

    function updatePreview() {
        const useColor = mode.value === 'color';
        if (useColor && !currentImage.colorPuzzle) {
            currentImage.colorPuzzle = makeColorPuzzle(currentImage.imageData);
        }
        const puzzle = useColor ? currentImage.colorPuzzle : {
            matrix: makeMonochromeMatrix(currentImage.imageData, Number(threshold.value)),
            palette: [[255, 255, 255], [0, 0, 0]],
            blank: 0,
        };
        currentImage.puzzle = puzzle;
        const { matrix, palette } = puzzle;
        document.getElementById('threshold-panel').hidden = useColor;
        document.getElementById('color-note').hidden = !useColor;
        document.getElementById('threshold-value').value = threshold.value;
        canvas.width = matrix[0].length;
        canvas.height = matrix.length;
        canvas.style.width = Math.min(240, canvas.width * 8, 240 * canvas.width / canvas.height) + 'px';
        const context = canvas.getContext('2d');
        const styles = palette.map(rgb => 'rgb(' + rgb.join(',') + ')');
        matrix.forEach((row, y) => row.forEach((value, x) => {
            context.fillStyle = styles[value];
            context.fillRect(x, y, 1, 1);
        }));

        const first = matrix[0][0];
        const uniform = matrix.every(row => row.every(value => value === first));
        let message = '';
        if (uniform) {
            message = useColor
                ? '盤面が一色になっています。別の画像やマス数をお試しください。'
                : '白か黒の一色になっています。境目を調整するか、明暗の差がある画像をお試しください。';
        }
        document.getElementById('preview-message').textContent = message;
    }

    function resetThreshold() {
        threshold.value = String(currentImage.suggestedThreshold);
        updatePreview();
    }

    function updateSize() {
        const image = currentImage.image;
        const imageData = rasterizePuzzleImage(image, side.valueAsNumber);
        currentImage.imageData = imageData;
        currentImage.colorPuzzle = undefined;
        currentImage.suggestedThreshold = suggestMonochromeThreshold(imageData);
        document.getElementById('preview-size').textContent =
            '元画像 ' + image.naturalWidth + ' × ' + image.naturalHeight +
            ' ／ 盤面 ' + imageData.width + ' × ' + imageData.height + ' マス';
        playPreview.disabled = false;
        resetThreshold();
    }

    function openPreview(fromColor) {
        const image = currentImage.image;
        const originalSide = Math.max(image.naturalWidth, image.naturalHeight);
        side.max = String(Math.min(originalSide, MAX_PUZZLE_SIDE));
        side.value = String(originalSide <= MAX_PUZZLE_SIDE ? originalSide : SUGGESTED_PHOTO_SIDE);
        const hasColorMode = ['jpeg', 'webp'].includes(currentImage.format);
        document.getElementById('puzzle-mode-panel').hidden = !hasColorMode;
        mode.value = hasColorMode ? 'color' : 'monochrome';
        updateSize();
        status.textContent = originalSide > MAX_PUZZLE_SIDE
            ? '大きな画像なので、最長辺' + SUGGESTED_PHOTO_SIDE + 'マスを提案します。' +
              MAX_PUZZLE_SIDE + 'マスまで変更できます。'
            : '';
        resumeColor.hidden = !fromColor;
        preview.hidden = false;
        setPlaying(false);
    }

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const selection = {};
        currentImage = selection;
        preview.hidden = true;
        status.textContent = '画像を読み込んでいます…';
        try {
            const decoded = await readPuzzleImage(file);
            if (currentImage !== selection) return;
            selection.image = decoded.image;
            selection.format = decoded.format;
            if (decoded.canPlayLegacyColor) {
                try {
                    const src = await readBase64(file);
                    if (currentImage !== selection) return;
                    startPuzzle(decodeLegacyPng(src), { shareSource: src, canConvert: true });
                    return;
                } catch {
                    if (currentImage !== selection) return;
                    openPreview(false);
                    status.textContent = 'このPNGはカラー問題にできません。白黒のプレビューを表示しました。';
                    return;
                }
            }
            openPreview(false);
        } catch (error) {
            if (currentImage !== selection) return;
            currentImage = undefined;
            input.value = '';
            status.textContent = error.message;
        }
    });

    side.addEventListener('input', () => {
        playPreview.disabled = !side.validity.valid || !side.value;
        if (!playPreview.disabled) updateSize();
    });
    mode.addEventListener('change', updatePreview);
    threshold.addEventListener('input', updatePreview);
    document.getElementById('reset-threshold').addEventListener('click', resetThreshold);
    document.getElementById('preview-monochrome').addEventListener('click', () => openPreview(true));
    resumeColor.addEventListener('click', () => setPlaying(true));
    playPreview.addEventListener('click', () => {
        startPuzzle(currentImage.puzzle, { generated: true });
    });
}

function setPlaying(playing) {
    document.getElementById('start-panel').hidden = playing;
    document.getElementById('play-panel').hidden = !playing;
    document.getElementById('pixelcanvas').hidden = !playing;
    document.getElementById('fix-phone-under-menu').hidden = !playing;
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
    const usedColors = options.generated
        ? new Set([...palette.slice(1).map((_, i) => i + 1), blank])
        : new Set(matrix.flat());
    g_selectcolor = usedColors.values().next().value;
    const rowClues = makeNumber(matrix, blank);
    const columnClues = makeNumber(transpose(matrix), blank);

    if (options.generated) {
        const longestSide = Math.max(matrix.length + columnClues[1], matrix[0].length + rowClues[1]);
        g_css = Math.max(10, Math.min(40, Math.floor(500 / longestSide)));
    } else {
        g_css = options.sample ? 40 : Math.max(Math.round(500 / (matrix.length + columnClues[1])), 10);
    }

    setPlaying(true);
    try {
        draw(matrix, palette, usedColors, rowClues, columnClues, blank);
    } catch (error) {
        setPlaying(false);
        throw error;
    }
    document.getElementById('play-options').open = false;
    setupBoardZoom();
    document.getElementById('preview-monochrome').hidden = !options.canConvert;

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

function setupBoardZoom() {
    const viewport = document.getElementById('pixelcanvas');
    const canvas = document.getElementById('canvas');
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const widthInCells = canvas.width / g_css;
    const heightInCells = canvas.height / g_css;
    const maxCellSize = 64;
    const fit = () => Math.max(1, Math.min(maxCellSize, Math.floor(Math.min(
        viewport.clientWidth / widthInCells, viewport.clientHeight / heightInCells
    ))));
    let cellSize;

    function resizeBoard(nextSize, center) {
        const previousSize = cellSize;
        const oldCenterX = Math.min(viewport.clientWidth, canvas.clientWidth) / 2;
        const oldCenterY = Math.min(viewport.clientHeight, canvas.clientHeight) / 2;
        const oldX = viewport.scrollLeft + oldCenterX;
        const oldY = viewport.scrollTop + oldCenterY;
        cellSize = nextSize;
        canvas.style.width = (widthInCells * cellSize) + 'px';
        canvas.style.height = (heightInCells * cellSize) + 'px';
        if (center && previousSize) {
            const ratio = cellSize / previousSize;
            viewport.scrollLeft = oldX * ratio - Math.min(viewport.clientWidth, canvas.clientWidth) / 2;
            viewport.scrollTop = oldY * ratio - Math.min(viewport.clientHeight, canvas.clientHeight) / 2;
        } else {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
        zoomIn.disabled = cellSize >= maxCellSize;
        zoomOut.disabled = cellSize <= 1;
    }

    const onSmallScreen = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
    const initialSize = onSmallScreen ? Math.max(28, Math.min(44, fit())) : Math.min(g_css, maxCellSize);
    resizeBoard(initialSize, false);
    zoomIn.onclick = () => resizeBoard(Math.min(maxCellSize, Math.ceil(cellSize * 1.25)), true);
    zoomOut.onclick = () => resizeBoard(Math.max(1, Math.floor(cellSize / 1.25)), true);
    document.getElementById('zoom-fit').onclick = () => resizeBoard(fit(), false);
}

function boardCellAt(x, y, rect, bufferWidth, bufferHeight, offset, cellSize, columns, rows) {
    if (!rect.width || !rect.height) return null;
    const column = Math.floor(((x - rect.left) * bufferWidth / rect.width - offset[0]) / cellSize);
    const row = Math.floor(((y - rect.top) * bufferHeight / rect.height - offset[1]) / cellSize);
    if (row < 0 || row >= rows || column < 0 || column >= columns) return null;
    return { row, column };
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
        const cell = boardCellAt(e.clientX, e.clientY, canvas.getBoundingClientRect(),
            canvas.width, canvas.height, offset, g_css, arr[0].length, arr.length);
        if (!cell) return;
        const { row, column } = cell;
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

// パレットを通常のボタンで表示し、指でもキーボードでも色を選べるようにする。
function drawUnderPalette(palette, usedColors, blank) {
    const container = document.getElementById('color-palette');
    container.replaceChildren();
    const colors = [...usedColors];
    if (!usedColors.has(blank)) colors.push(blank);
    colors.push(-1);

    let selected;
    for (const color of colors) {
        const button = document.createElement('button');
        const swatch = document.createElement('span');
        button.type = 'button';
        button.className = 'palette-color';
        swatch.className = 'palette-swatch';

        let label;
        if (color === -1) {
            label = '斜線で印を付ける';
            swatch.classList.add('palette-mark');
        } else if (color === blank) {
            label = '空白に戻す';
        } else {
            const hexColor = '#' + palette[color].map(channel => channel.toString(16).padStart(2, '0')).join('');
            label = '色 ' + hexColor;
            swatch.style.backgroundColor = hexColor;
        }
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(g_selectcolor === color));
        if (g_selectcolor === color) selected = button;
        button.append(swatch);
        button.onclick = () => {
            selected?.setAttribute('aria-pressed', 'false');
            selected = button;
            button.setAttribute('aria-pressed', 'true');
            g_selectcolor = color;
        };
        container.append(button);
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
