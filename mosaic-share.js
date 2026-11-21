const mosaicSharePrefix = '#mosaic=';
const maxMosaicShareLength = 8_000;
// A 400-tile puzzle has at most 40,000 cells. Allow room for the JSON and palette.
const maxMosaicShareBytes = 200_000;

async function mosaicShareURL(pageURL, { matrix, palette, blank }) {
    const json = JSON.stringify({ matrix, palette, blank });
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (bytes.length > maxMosaicShareLength * 3 / 4) return null;
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = new URL(pageURL);
    url.search = '';
    url.hash = mosaicSharePrefix + '1.' + encoded;
    return url.href.length <= maxMosaicShareLength ? url.href : null;
}

async function readMosaicShare(hash) {
    const marker = mosaicSharePrefix + '1.';
    const invalid = () => new Error('分割ノノグラムの共有リンクが不正です。');
    if (!hash.startsWith(marker) || hash.length > maxMosaicShareLength) throw invalid();
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
            if (size > maxMosaicShareBytes) throw invalid();
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
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0]) || !canSplitPuzzle(matrix) ||
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
