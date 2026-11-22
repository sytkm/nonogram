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
const { puzzleShareURL, readPuzzleShare, mosaicShareURL, readMosaicShare, splitMosaic } = context;
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
    const puzzle = { matrix, palette, blank: 0 };
    assert.equal(await mosaicShareURL(base, puzzle), null);
    assert.equal(await puzzleShareURL(base, puzzle), null);
});

test('小さなカラー問題の寸法・色・空白が通常リンクと1区画の分割リンクで復元できる', async () => {
    const puzzle = {
        matrix: [[0, 2, 1], [2, 0, 1]],
        palette: [[20, 80, 150], [200, 100, 20]],
        blank: 2,
    };
    const link = new URL(await puzzleShareURL(base + '?sample#old', { ...puzzle, clock: { elapsed: 3000 } }));
    assert.equal(link.search, '');
    assert.match(link.hash, /^#puzzle=1\./);
    assert.deepEqual(normalize(await readPuzzleShare(link.hash)), puzzle);
    const splitLink = new URL(await mosaicShareURL(base, puzzle));
    const splitPuzzle = await readMosaicShare(splitLink.hash);
    assert.deepEqual(normalize(splitPuzzle), puzzle);
    assert.equal(splitMosaic(splitPuzzle.matrix, splitPuzzle.blank).tiles.length, 1);
});

test('通常リンクで空の行やマス数の上限を超えた盤面は開かない', async () => {
    const hashFor = matrix => '#puzzle=1.' + gzipSync(JSON.stringify({
        matrix, palette: [[0, 0, 0]], blank: 1,
    })).toString('base64url');
    await assert.rejects(readPuzzleShare(hashFor([[]])));
    await assert.rejects(readPuzzleShare(hashFor(Array.from({ length: 201 }, () => Array(200).fill(0)))));
});
