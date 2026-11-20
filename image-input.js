// 白黒の盤面は最長辺を30マスに収め、元画像の縦横比を保つ。
const MAX_PUZZLE_SIDE = 30;

function fitPuzzleSize(width, height) {
    const scale = Math.min(1, MAX_PUZZLE_SIDE / Math.max(width, height));
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
        const { width, height } = fitPuzzleSize(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        return {
            imageData: context.getImageData(0, 0, width, height),
            canPlayLegacyColor: format === 'png' && header[25] === 3 && header[28] === 0,
        };
    } finally {
        URL.revokeObjectURL(source);
    }
}

function makeMonochromeMatrix({ data, width, height }, threshold) {
    return Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) => {
            const i = (row * width + column) * 4;
            const alpha = data[i + 3] / 255;
            const brightness = (2126 * data[i] + 7152 * data[i + 1] + 722 * data[i + 2]) / 10000;
            // 透明な部分は白い背景に重ねてから判定する。
            const onWhite = brightness * alpha + 255 * (1 - alpha);
            return onWhite < threshold ? 1 : 0;
        })
    );
}
