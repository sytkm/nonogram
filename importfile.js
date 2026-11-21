// Nonogramの生成ファイル

// 選択色
let g_selectcolor = 0;

// 描画したマトリクス
let g_drawmatrix = [];

// 表示中の盤面だけ、画面の解像度が変わったときに描き直す。
let refreshBoard;

// 5×5の十字を描いたパレット形式のサンプルPNG。
const samplePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAMAAAC6sdbXAAAABlBMVEX///8wW6NnOUAjAAAAFUlEQVR4nGNgYGBkAAEQyQgCDEgiAAClAAqu0sLdAAAAAElFTkSuQmCC';

window.onload = function () {
    setupImagePicker();
    window.addEventListener('resize', () => refreshBoard?.());

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
    const splitPreview = document.getElementById('split-preview');
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
        splitPreview.hidden = !canSplitPuzzle(matrix);
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
        splitPreview.disabled = false;
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
        splitPreview.disabled = playPreview.disabled;
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
    splitPreview.addEventListener('click', () => openMosaic(currentImage.puzzle));
}

function setPlaying(playing) {
    document.getElementById('start-panel').hidden = playing;
    document.getElementById('mosaic-panel').hidden = true;
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
    const dataChunks = chunks.filter(chunk => chunk.chunkType === 'IDAT');
    if (header?.length !== 13 || header[9] !== 3 || header[12] !== 0 || !colors || !dataChunks.length) {
        throw new Error('対応していないカラーPNGです。');
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(0);
    const height = view.getUint32(4);
    const bitDepth = header[8];
    if (!width || !height || ![1, 2, 4, 8].includes(bitDepth)) {
        throw new Error('PNGの寸法またはビット深度が不正です。');
    }

    // PNGではすべてのIDATをつなげてから展開する。
    const compressed = new Uint8Array(dataChunks.reduce((size, chunk) => size + chunk.chunkLength, 0));
    let offset = 0;
    for (const { chunkData } of dataChunks) {
        compressed.set(chunkData, offset);
        offset += chunkData.length;
    }
    const pixels = new Zlib.Inflate(compressed).decompress();
    if (pixels.length !== height * (1 + Math.ceil(width * bitDepth / 8))) {
        throw new Error('PNGの画素数が画像サイズと一致しません。');
    }
    const matrix = makePNGMatrix(pixels, width, height, bitDepth);
    const palette = paletteColor(colors);
    const alphaByIndex = find('tRNS');
    // 透過情報のない画像では、従来どおりパレットの0番を背景として使う。
    const blank = alphaByIndex ? palette.length : 0;
    for (const row of matrix) {
        for (let column = 0; column < row.length; column++) {
            const index = row[column];
            if (index >= palette.length) throw new Error('PNGの色番号が不正です。');
            if (alphaByIndex?.[index] === 0) row[column] = blank;
        }
    }
    if (alphaByIndex) {
        for (let index = 0; index < palette.length; index++) {
            const alpha = (alphaByIndex[index] ?? 255) / 255;
            if (alpha > 0 && alpha < 1) {
                palette[index] = palette[index].map(channel => Math.round(channel * alpha + 255 * (1 - alpha)));
            }
        }
    }
    return { matrix, palette, blank };
}

function startPuzzle({ matrix, palette, blank }, options = {}) {
    g_drawmatrix = options.initialBoard ?? matrix.map(row => row.map(() => blank));
    const usedColors = options.generated
        ? new Set([...palette.slice(1).map((_, i) => i + 1), blank])
        : new Set(matrix.flat());
    g_selectcolor = usedColors.values().next().value;
    const rowClues = makeNumber(matrix, blank);
    const columnClues = makeNumber(transpose(matrix), blank);

    const widthInCells = matrix[0].length + rowClues[1];
    const heightInCells = matrix.length + columnClues[1];
    const initialCellSize = options.generated
        ? Math.max(10, Math.min(40, Math.floor(500 / Math.max(widthInCells, heightInCells))))
        : options.sample ? 40 : Math.max(Math.round(500 / heightInCells), 10);

    document.getElementById('play-options').open = false;
    setPlaying(true);
    try {
        drawUnderPalette(palette, usedColors, blank);
        setupBoard(matrix, palette, blank, rowClues, columnClues, initialCellSize);
    } catch (error) {
        setPlaying(false);
        throw error;
    }
    document.getElementById('preview-monochrome').hidden = !options.canConvert;
    const splitBoard = document.getElementById('split-board');
    splitBoard.hidden = options.shared === true || Boolean(options.tileLabel) || !canSplitPuzzle(matrix);
    splitBoard.onclick = () => openMosaic({ matrix, palette, blank });
    const tileLabel = document.getElementById('mosaic-tile-label');
    tileLabel.hidden = !options.tileLabel;
    tileLabel.textContent = options.tileLabel ?? '';
    const returnToMosaic = document.getElementById('return-mosaic');
    returnToMosaic.hidden = !options.onReturn;
    returnToMosaic.onclick = options.onReturn ?? null;
    document.getElementById('board-home').hidden = Boolean(options.onReturn);

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
    download.hidden = options.shared === true || Boolean(options.tileLabel);
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
        if (solved && options.onSolved) {
            options.onSolved();
            return;
        }
        alert(solved ? '正解！' : 'まだ一致していません。');
    };
    if (options.tileLabel) returnToMosaic.focus();
}

function boardResolution(width, height, pixelRatio) {
    // 大きな盤面を拡大しても、描画用のメモリを使いすぎないようにする。
    const scale = Math.min(pixelRatio, 4096 / width, 4096 / height, Math.sqrt(8_388_608 / (width * height)));
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}

function setupBoard(answer, palette, blank, rowClues, columnClues, initialCellSize) {
    const viewport = document.getElementById('pixelcanvas');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const paintMode = document.getElementById('paint-mode');
    const instructions = document.getElementById('paint-instructions');
    const columns = answer[0].length;
    const rows = answer.length;
    const [rowsOfClues, leftClueCount] = rowClues;
    const [columnsOfClues, topClueCount] = columnClues;
    const widthInCells = columns + leftClueCount;
    const heightInCells = rows + topClueCount;
    const maxCellSize = 64;
    const fit = () => Math.max(1, Math.min(maxCellSize, Math.floor(Math.min(
        viewport.clientWidth / widthInCells, viewport.clientHeight / heightInCells
    ))));
    let cellSize;
    let tracing = false;
    let stroke;

    function renderBoard(force = false) {
        const size = boardResolution(widthInCells * cellSize, heightInCells * cellSize,
            window.devicePixelRatio || 1);
        if (!force && canvas.width === size.width && canvas.height === size.height) return;
        if (canvas.width !== size.width || canvas.height !== size.height) {
            canvas.width = size.width;
            canvas.height = size.height;
        }

        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        g_drawmatrix.forEach((row, y) => row.forEach((color, x) => paintCell(y, x, color)));

        const fontSize = Math.max(1, Math.floor(Math.min(
            canvas.width / widthInCells, canvas.height / heightInCells
        ) * 0.68));
        context.font = '600 ' + fontSize + 'px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // ヒントを盤面側に揃え、どの行・列の数字か追いやすくする。
        rowsOfClues.forEach((clues, y) => clues.forEach((clue, x) =>
            paintClue(leftClueCount - clues.length + x, topClueCount + y, clue)
        ));
        columnsOfClues.forEach((clues, x) => clues.forEach((clue, y) =>
            paintClue(leftClueCount + x, topClueCount - clues.length + y, clue)
        ));
    }

    function rectangle(column, row) {
        // 端を描画面の整数座標に揃え、罫線のにじみを防ぐ。
        const left = Math.round(column * canvas.width / widthInCells);
        const top = Math.round(row * canvas.height / heightInCells);
        return {
            left,
            top,
            width: Math.round((column + 1) * canvas.width / widthInCells) - left,
            height: Math.round((row + 1) * canvas.height / heightInCells) - top,
        };
    }

    function paintClue(column, row, [color, count]) {
        const { left, top, width, height } = rectangle(column, row);
        if (!width || !height) return;
        if (color >= 0) {
            context.fillStyle = 'rgb(' + palette[color].join(',') + ')';
            context.fillRect(left, top, width, height);
            context.fillStyle = chooseTextColor(...palette[color]);
        } else {
            context.fillStyle = '#111';
        }
        if (cellSize >= 6 && width >= 4 && height >= 4) {
            context.fillText(String(count), left + width / 2, top + height / 2, width * 0.85);
        }
    }

    function paintCell(row, column, color) {
        const { left, top, width, height } = rectangle(leftClueCount + column, topClueCount + row);
        if (!width || !height) return;
        context.fillStyle = color === blank || color < 0 ? '#fff' : 'rgb(' + palette[color].join(',') + ')';
        context.fillRect(left, top, width, height);

        const border = Math.min(width, height) >= 24 ? 2 : 1;
        if (Math.min(width, height) >= 3) {
            context.fillStyle = '#555';
            context.fillRect(left, top, width, border);
            context.fillRect(left, top, border, height);
            if (row === rows - 1) context.fillRect(left, top + height - border, width, border);
            if (column === columns - 1) context.fillRect(left + width - border, top, border, height);
        }
        if (color < 0 && Math.min(width, height) >= 4) {
            context.strokeStyle = '#222';
            context.lineWidth = border;
            context.beginPath();
            context.moveTo(left + width - border, top + border);
            context.lineTo(left + border, top + height - border);
            context.stroke();
        }
    }

    function resizeBoard(nextSize, center) {
        stopStroke();
        const previousSize = cellSize;
        const oldX = viewport.scrollLeft + Math.min(viewport.clientWidth, canvas.clientWidth) / 2;
        const oldY = viewport.scrollTop + Math.min(viewport.clientHeight, canvas.clientHeight) / 2;
        cellSize = nextSize;
        canvas.style.width = (widthInCells * cellSize) + 'px';
        canvas.style.height = (heightInCells * cellSize) + 'px';
        renderBoard(true);
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
    resizeBoard(onSmallScreen ? Math.max(28, Math.min(44, fit())) : Math.min(initialCellSize, maxCellSize), false);
    zoomIn.onclick = () => resizeBoard(Math.min(maxCellSize, Math.ceil(cellSize * 1.25)), true);
    zoomOut.onclick = () => resizeBoard(Math.max(1, Math.floor(cellSize / 1.25)), true);
    document.getElementById('zoom-fit').onclick = () => resizeBoard(fit(), false);
    document.getElementById('solve').onclick = () => {
        stopStroke();
        g_drawmatrix = answer.map(row => row.slice());
        renderBoard(true);
    };

    function setTracing(enabled) {
        stopStroke();
        tracing = enabled;
        paintMode.setAttribute('aria-pressed', String(enabled));
        canvas.classList.toggle('is-painting', enabled);
        instructions.textContent = enabled
            ? '指やマウスでなぞるとまとめて塗れます。盤面を移動するには「なぞり塗り」をオフにします。'
            : '下で色を選び、マスを押して塗ります。大きな盤面は上下左右にスクロールできます。';
    }

    function pointFor(event) {
        return boardPointAt(event.clientX, event.clientY, canvas.getBoundingClientRect(),
            widthInCells, heightInCells, [leftClueCount, topClueCount]);
    }

    function applyColor({ row, column }, color) {
        if (g_drawmatrix[row][column] === color) return;
        g_drawmatrix[row][column] = color;
        paintCell(row, column, color);
    }

    function continueStroke(event) {
        if (!stroke || event.pointerId !== stroke.id) return;
        const point = pointFor(event);
        if (!point) return;
        for (const cell of traceBoardCells(stroke.point, point, columns, rows)) {
            applyColor(cell, stroke.color);
        }
        stroke.point = point;
    }

    function stopStroke() {
        const id = stroke?.id;
        stroke = undefined;
        if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }

    setTracing(false);
    paintMode.onclick = () => setTracing(!tracing);
    canvas.onclick = event => {
        if (tracing) return;
        const cell = boardCellAt(pointFor(event), columns, rows);
        if (!cell) return;
        applyColor(cell, g_selectcolor);
    };
    canvas.onpointerdown = event => {
        if (!tracing || stroke || !event.isPrimary || event.button !== 0) return;
        const point = pointFor(event);
        const cell = boardCellAt(point, columns, rows);
        if (!cell) return;
        canvas.setPointerCapture(event.pointerId);
        stroke = { id: event.pointerId, point, color: g_selectcolor };
        applyColor(cell, stroke.color);
    };
    canvas.onpointermove = event => {
        if (!stroke || event.pointerId !== stroke.id) return;
        for (const move of event.getCoalescedEvents?.() ?? []) continueStroke(move);
        continueStroke(event);
    };
    canvas.onpointerup = event => {
        if (!stroke || event.pointerId !== stroke.id) return;
        continueStroke(event);
        stopStroke();
    };
    canvas.onpointercancel = canvas.onlostpointercapture = event => {
        if (event.pointerId === stroke?.id) stopStroke();
    };
    refreshBoard = () => renderBoard();
}

function boardPointAt(x, y, rect, widthInCells, heightInCells, offset) {
    if (!rect.width || !rect.height) return null;
    return {
        x: (x - rect.left) * widthInCells / rect.width - offset[0],
        y: (y - rect.top) * heightInCells / rect.height - offset[1],
    };
}

function boardCellAt(point, columns, rows) {
    if (!point) return null;
    const column = Math.floor(point.x);
    const row = Math.floor(point.y);
    if (row < 0 || row >= rows || column < 0 || column >= columns) return null;
    return { row, column };
}

function traceBoardCells(from, to, columns, rows) {
    const cells = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let column = Math.floor(from.x);
    let row = Math.floor(from.y);
    const endColumn = Math.floor(to.x);
    const endRow = Math.floor(to.y);
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    // 次に横切る罫線を順にたどる。移動イベントの間に飛び越えたマスも塗る。
    while (true) {
        if (column >= 0 && column < columns && row >= 0 && row < rows) cells.push({ row, column });
        if (column === endColumn && row === endRow) return cells;
        const crossX = column === endColumn ? Infinity : (column + (stepX > 0 ? 1 : 0) - from.x) / dx;
        const crossY = row === endRow ? Infinity : (row + (stepY > 0 ? 1 : 0) - from.y) / dy;
        if (crossX < crossY || Math.abs(crossX - crossY) < 1e-9) column += stepX;
        if (crossY < crossX || Math.abs(crossX - crossY) < 1e-9) row += stepY;
    }
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
    let previous = new Uint8Array(depthwidth);
    for (let i = 0; i < pngheight; i++) {
        const start = (depthwidth + 1) * i;
        const bytes = data.slice(start + 1, start + 1 + depthwidth);
        undoIndexedPngFilter(bytes, previous, data[start]);
        previous = bytes;
        const row = bitdepth < 8 ? optimizeData(bytes, bitdepth) : Array.from(bytes);
        // ビット展開で生じた行末の余白を、画像の幅に合わせて取り除く。
        pngmatrix.push(row.slice(0, pngwidth));
    }
    return pngmatrix;
}

function undoIndexedPngFilter(row, previous, filter) {
    if (filter === 0) return;
    if (filter < 1 || filter > 4) throw new Error('PNGの行フィルターが不正です。');
    // パレット形式はビット深度にかかわらず、フィルターの左隣は1バイト前。
    for (let i = 0; i < row.length; i++) {
        const left = i === 0 ? 0 : row[i - 1];
        const above = previous[i];
        if (filter === 1) row[i] += left;
        if (filter === 2) row[i] += above;
        if (filter === 3) row[i] += Math.floor((left + above) / 2);
        if (filter === 4) {
            const upperLeft = i === 0 ? 0 : previous[i - 1];
            row[i] += paethPredictor(left, above, upperLeft);
        }
    }
}

function paethPredictor(left, above, upperLeft) {
    const estimate = left + above - upperLeft;
    const toLeft = Math.abs(estimate - left);
    const toAbove = Math.abs(estimate - above);
    const toUpperLeft = Math.abs(estimate - upperLeft);
    if (toLeft <= toAbove && toLeft <= toUpperLeft) return left;
    return toAbove <= toUpperLeft ? above : upperLeft;
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
