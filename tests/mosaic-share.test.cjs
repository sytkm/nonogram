const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');
const test = require('node:test');

const context = vm.createContext({ URL, Blob, CompressionStream, DecompressionStream, Response, TextDecoder, atob, btoa });
for (const file of ['mosaic.js', 'mosaic-share.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const { mosaicShareURL, readMosaicShare, splitMosaic } = context;
const base = 'https://example.org/nonogram/';
const normalize = value => JSON.parse(JSON.stringify(value));

test('分割共有で端の寸法・色・空白を復元し、送信者の進捗は含めない', async () => {
    const original = {
        matrix: Array.from({ length: 11 }, (_, y) => Array.from({ length: 13 }, (_, x) => (x + y) % 3)),
        palette: [[20, 80, 150], [200, 100, 20]],
        blank: 2,
    };
    const link = new URL(await mosaicShareURL(base + '?sample#old', {
        ...original, tiles: [{ complete: true, clock: { elapsed: 5000 } }],
    }));
    assert.equal(link.search, '');
    assert.match(link.hash, /^#mosaic=1\./);
    const puzzle = await readMosaicShare(link.hash);
    assert.deepEqual(normalize(puzzle), original);
    const mosaic = splitMosaic(puzzle.matrix, puzzle.blank);
    assert.equal(mosaic.columns, 2);
    assert.deepEqual(normalize(mosaic.tiles.map(tile => [tile.width, tile.height])), [[10, 10], [3, 10], [10, 1], [3, 1]]);
    assert.equal(mosaic.tiles[3].answer[0][3], original.blank);
    assert.equal(mosaic.tiles[0].complete, false);
});

test('破損・未対応バージョン・不正な盤面と展開上限を超えるリンクを拒否する', async () => {
    const hashFor = json => '#mosaic=1.' + gzipSync(json).toString('base64url');
    await assert.rejects(readMosaicShare('#mosaic=2.AAAA'));
    await assert.rejects(readMosaicShare('#mosaic=1.AAAA'));
    await assert.rejects(readMosaicShare('#mosaic=1.' + 'A'.repeat(8_000)));
    await assert.rejects(readMosaicShare(hashFor(' '.repeat(200_001))));
    const palette = [[255, 255, 255], [0, 0, 0]];
    const matrix = Array.from({ length: 11 }, () => [0, 1]);
    matrix[10][0] = 9;
    await assert.rejects(readMosaicShare(hashFor(JSON.stringify({ matrix, palette, blank: 0 }))));
});

test('圧縮できても共有URLが8,000文字を超える場合は作成を中止する', async () => {
    let seed = 1;
    const matrix = Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed >>> 24;
    }));
    const palette = Array.from({ length: 256 }, (_, color) => [color, color, color]);
    assert.equal(await mosaicShareURL(base, { matrix, palette, blank: 0 }), null);
});
