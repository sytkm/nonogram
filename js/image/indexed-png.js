/**
 * 従来の共有リンクとファイル読み込みで使うパレット形式PNGを復号する。透過がなければパレット0番を空白として扱う。
 * @param {string} src - PNGのBase64文字列
 * @returns {PuzzleData}
 * @throws {Error} PNGが壊れているか、対応外の形式の場合
 */
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

function readChunk(source) {
    const length = new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(0);
    const type = String.fromCharCode(...source.subarray(4, 8));
    return { chunkLength: length, chunkType: type, chunkData: source.slice(8, 8 + length) };
}

/**
 * PNGの行を復元し、行末のパディングを除いたパレット番号の行列を返す。
 * @param {Uint8Array} data - 展開済みの行データ（各行の先頭にフィルター番号を含む）
 * @param {number} pngwidth - 画像の幅
 * @param {number} pngheight - 画像の高さ
 * @param {1|2|4|8} bitdepth - パレット番号1つあたりのビット数
 * @returns {number[][]}
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

function paletteColor(source) {
    const palette = [];
    for (let i = 0; i < source.length; i += 3) {
        palette.push([source[i], source[i + 1], source[i + 2]]);
    }
    return palette;
}
