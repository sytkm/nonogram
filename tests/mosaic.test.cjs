const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/play/mosaic.js'), 'utf8'), context);

test('余りがある画像を10×10の正方形に分け、余白は背景色で埋める', () => {
    const blank = 256;
    const source = Array.from({ length: 11 }, (_, y) =>
        Array.from({ length: 12 }, (_, x) => (x + y) % 4));
    const mosaic = context.splitMosaic(source, blank);
    assert.equal(mosaic.width, 12);
    assert.equal(mosaic.height, 11);
    assert.equal(mosaic.columns, 2);
    assert.equal(mosaic.tiles.length, 4);
    const restored = source.map(row => row.map(() => null));
    for (const tile of mosaic.tiles) {
        assert.equal(tile.answer.length, 10);
        assert.ok(tile.answer.every(row => row.length === 10));
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                if (y < tile.height && x < tile.width) {
                    restored[tile.top + y][tile.left + x] = tile.answer[y][x];
                } else {
                    assert.equal(tile.answer[y][x], blank);
                }
            }
        }
    }
    assert.deepEqual(restored, source);
});

test('完全に空白の区画だけを完成済みとして扱う', () => {
    const source = [Array(21).fill(256)];
    source[0][0] = 0; // 透明の背景とは異なり、色番号0は塗る色。
    const { tiles } = context.splitMosaic(source, 256);
    assert.deepEqual(Array.from(tiles, tile => tile.complete), [false, true, true]);
});

test('1区画から400区画まで分割で開始できる', () => {
    const image = (width, height) => Array.from({ length: height }, () => Array(width).fill(0));
    assert.equal(context.canSplitPuzzle(image(0, 0)), false);
    assert.equal(context.canSplitPuzzle(image(8, 9)), true);
    assert.equal(context.canSplitPuzzle(image(10, 10)), true);
    assert.equal(context.canSplitPuzzle(image(10, 11)), true);
    assert.equal(context.canSplitPuzzle(image(200, 200)), true);
    assert.equal(context.canSplitPuzzle(image(201, 200)), false);
    assert.equal(context.mosaicTileCount(image(201, 200)), 420);
});

test('拡大PNGは整数倍のまま最長辺を抑え、すでに大きい画像は拡大しない', () => {
    assert.equal(context.mosaicExportScale(22, 5), 32);
    assert.equal(context.mosaicExportScale(125, 400), 2);
    assert.equal(context.mosaicExportScale(1025, 10), 1);
});
