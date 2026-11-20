// ブラウザで盤面を描画できる大きさに収める。
const MAX_PUZZLE_SIDE = 200;
const SUGGESTED_PHOTO_SIDE = 40;
const MAX_PAINT_COLORS = 7;
const WHITE_BACKGROUND_LEVEL = 245;
const MIN_PALETTE_DISTANCE = 40;

function fitPuzzleSize(width, height, longestSide) {
    const scale = Math.min(1, longestSide / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function detectImageFormat(header) {
    const matches = (offset, signature) =>
        signature.every((byte, index) => header[offset + index] === byte);

    if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
    if (matches(0, [255, 216, 255])) return 'jpeg';
    if (matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80])) return 'webp';
    return null;
}

async function readPuzzleImage(file) {
    const header = new Uint8Array(await file.slice(0, 29).arrayBuffer());
    const format = detectImageFormat(header);
    if (!format) {
        throw new Error('PNG、JPEG、WebPの画像を選んでください。');
    }

    const source = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = source;
        try {
            await image.decode();
        } catch {
            throw new Error('画像を読み込めませんでした。別の画像を選ぶか、PNGに変換してお試しください。');
        }
        return {
            image,
            format,
            canPlayLegacyColor: format === 'png' && header[25] === 3 && header[28] === 0,
        };
    } finally {
        URL.revokeObjectURL(source);
    }
}

function rasterizePuzzleImage(image, longestSide) {
    const { width, height } = fitPuzzleSize(image.naturalWidth, image.naturalHeight, longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
}

function pixelBrightness(data, i) {
    const alpha = data[i + 3] / 255;
    const brightness = (2126 * data[i] + 7152 * data[i + 1] + 722 * data[i + 2]) / 10000;
    // 透明な部分は白い背景に重ねてから判定する。
    return brightness * alpha + 255 * (1 - alpha);
}

// 大津の方法。明るさの分布を暗い組と明るい組に最もよく分ける境目を探す。
function suggestMonochromeThreshold({ data }) {
    const histogram = new Uint32Array(256);
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        const level = Math.floor(pixelBrightness(data, i));
        histogram[level]++;
        totalBrightness += level;
    }

    let darkCount = 0;
    let darkBrightness = 0;
    let bestScore = -1;
    let firstBest = 128;
    let lastBest = 128;
    for (let threshold = 1; threshold <= 255; threshold++) {
        darkCount += histogram[threshold - 1];
        darkBrightness += histogram[threshold - 1] * (threshold - 1);
        const lightCount = data.length / 4 - darkCount;
        if (!lightCount) break;
        if (!darkCount) continue;
        const difference = darkBrightness / darkCount - (totalBrightness - darkBrightness) / lightCount;
        const score = darkCount * lightCount * difference ** 2;
        if (score > bestScore) {
            bestScore = score;
            firstBest = lastBest = threshold;
        } else if (score === bestScore && threshold === lastBest + 1) {
            lastBest = threshold;
        }
    }
    return Math.round((firstBest + lastBest) / 2);
}

function makeMonochromeMatrix({ data, width, height }, threshold) {
    return Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) => {
            const i = (row * width + column) * 4;
            return pixelBrightness(data, i) < threshold ? 1 : 0;
        })
    );
}

function makeColorPuzzle({ data, width, height }) {
    // 白に合成し、JPEGの白背景に出るわずかな色の差は空白にまとめる。
    const colors = new Map();
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        const rgb = [0, 1, 2].map(channel => Math.round(data[i + channel] * alpha + 255 * (1 - alpha)));
        if (rgb.every(value => value >= WHITE_BACKGROUND_LEVEL)) {
            pixels.push(null);
            continue;
        }
        const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        if (!colors.has(key)) colors.set(key, { rgb, count: 0 });
        const entry = colors.get(key);
        entry.count++;
        pixels.push(entry);
    }

    const groups = colors.size ? [describeColorGroup([...colors.values()])] : [];
    while (groups.length < MAX_PAINT_COLORS) {
        // 最も色のばらつきが大きいグループを、画素数の中央値で分ける。
        let best = -1;
        for (let i = 0; i < groups.length; i++) {
            if (groups[i].priority > (best === -1 ? 0 : groups[best].priority)) best = i;
        }
        if (best === -1) break;
        const { entries, channel, count } = groups[best];
        entries.sort((a, b) => a.rgb[channel] - b.rgb[channel]);
        let split = 1;
        let leftCount = entries[0].count;
        while (leftCount < count / 2 && split < entries.length - 1) {
            leftCount += entries[split++].count;
        }
        groups.splice(best, 1, describeColorGroup(entries.slice(0, split)), describeColorGroup(entries.slice(split)));
    }

    const palette = [[255, 255, 255]];
    groups.sort((a, b) => b.count - a.count);
    for (const { entries, count } of groups) {
        const sum = [0, 0, 0];
        for (const entry of entries) {
            for (let channel = 0; channel < 3; channel++) {
                sum[channel] += entry.rgb[channel] * entry.count;
            }
        }
        const representative = sum.map(value => Math.round(value / count));
        // 圧縮などで生じた似た色は、色見本を見分けやすくするためにまとめる。
        if (palette.slice(1).every(color => colorDistanceSquared(color, representative) >= MIN_PALETTE_DISTANCE ** 2)) {
            palette.push(representative);
        }
    }
    for (const entry of colors.values()) {
        let closest = 1;
        for (let i = 2; i < palette.length; i++) {
            if (colorDistanceSquared(entry.rgb, palette[i]) < colorDistanceSquared(entry.rgb, palette[closest])) {
                closest = i;
            }
        }
        entry.paletteIndex = closest;
    }
    const matrix = Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) => pixels[row * width + column]?.paletteIndex ?? 0)
    );
    return { matrix, palette, blank: 0 };
}

function colorDistanceSquared(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function describeColorGroup(entries) {
    const min = [255, 255, 255];
    const max = [0, 0, 0];
    let count = 0;
    for (const { rgb, count: frequency } of entries) {
        count += frequency;
        for (let channel = 0; channel < 3; channel++) {
            min[channel] = Math.min(min[channel], rgb[channel]);
            max[channel] = Math.max(max[channel], rgb[channel]);
        }
    }
    const ranges = max.map((value, channel) => value - min[channel]);
    const spread = Math.max(...ranges);
    return { entries, count, channel: ranges.indexOf(spread), priority: spread ** 2 * count };
}
