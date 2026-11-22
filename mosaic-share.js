const normalSharePrefix = '#puzzle=';
const mosaicSharePrefix = '#mosaic=';
const maxPuzzleShareLength = 8_000;
// Allow room for 40,000 cells plus the JSON structure and palette.
const maxSharedPuzzleCells = 40_000;
const maxPuzzleShareBytes = 200_000;

function mosaicShareURL(pageURL, puzzle) {
    return puzzleShareURL(pageURL, puzzle, mosaicSharePrefix);
}

async function puzzleShareURL(pageURL, { matrix, palette, blank }, prefix = normalSharePrefix) {
    const json = JSON.stringify({ matrix, palette, blank });
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (bytes.length > maxPuzzleShareLength * 3 / 4) return null;
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = new URL(pageURL);
    url.search = '';
    url.hash = prefix + '1.' + encoded;
    return url.href.length <= maxPuzzleShareLength ? url.href : null;
}

function readMosaicShare(hash) {
    return readPuzzleShare(hash, mosaicSharePrefix);
}

async function readPuzzleShare(hash, prefix = normalSharePrefix) {
    const marker = prefix + '1.';
    const invalid = () => new Error('ノノグラムの共有リンクが不正です。');
    if (!hash.startsWith(marker) || hash.length > maxPuzzleShareLength) throw invalid();
    const encoded = hash.slice(marker.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw invalid();

    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let json = '';
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxPuzzleShareBytes) throw invalid();
            json += decoder.decode(value, { stream: true });
        }
        json += decoder.decode();
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }

    const { matrix, palette, blank } = JSON.parse(json);
    const width = matrix?.[0]?.length;
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0]) || !width || width * matrix.length > maxSharedPuzzleCells ||
        (prefix === mosaicSharePrefix && !canSplitPuzzle(matrix)) ||
        !Array.isArray(palette) || !palette.length || palette.length > 256 ||
        !Number.isInteger(blank) || blank < 0 || blank > palette.length ||
        !palette.every(color => Array.isArray(color) && color.length === 3 &&
            color.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) ||
        !matrix.every(row => Array.isArray(row) && row.length === width &&
            row.every(color => color === blank || (Number.isInteger(color) && color >= 0 && color < palette.length)))) {
        throw invalid();
    }
    return { matrix, palette, blank };
}
