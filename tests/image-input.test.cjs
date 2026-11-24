const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/image/image-input.js'), 'utf8'), context);

test('指定した最長辺で縦横比を保ち、元画像より拡大しない', () => {
    for (const [width, height, side, expected] of [
        [600, 300, 40, { width: 40, height: 20 }],
        [1, 200, 60, { width: 1, height: 60 }],
        [64, 40, 64, { width: 64, height: 40 }],
        [8, 12, 24, { width: 8, height: 12 }],
    ]) {
        assert.deepEqual({ ...context.fitPuzzleSize(width, height, side) }, expected);
    }
});

test('明るい画像でも暗い画像でも、元の輪郭に対応する境目を自動で選ぶ', () => {
    for (const [foreground, background] of [[160, 220], [25, 85]]) {
        const image = {
            width: 3,
            height: 2,
            data: Uint8ClampedArray.from(
                [background, foreground, background, foreground, foreground, foreground]
                    .flatMap(value => [value, value, value, 255])
            ),
        };
        const threshold = context.suggestMonochromeThreshold(image);
        assert.ok(threshold > foreground && threshold <= background);
        const matrix = context.makeMonochromeMatrix(image, threshold);
        assert.deepEqual(JSON.parse(JSON.stringify(matrix)), [[0, 1, 0], [1, 1, 1]]);
    }
});

test('カラー盤面は異なる色を保ち、透明と白に近い画素を空白にする', () => {
    const image = {
        width: 2,
        height: 2,
        data: Uint8ClampedArray.from([
            230, 20, 40, 255, 0, 0, 0, 0,
            250, 249, 246, 255, 12, 45, 235, 255,
        ]),
    };
    const { matrix, palette, blank } = context.makeColorPuzzle(image);
    assert.equal(matrix[0][1], blank);
    assert.equal(matrix[1][0], blank);
    assert.deepEqual([...palette[matrix[0][0]]], [230, 20, 40]);
    assert.deepEqual([...palette[matrix[1][1]]], [12, 45, 235]);
});

test('多色の画像を背景色込みで最大16色に整理し、画素は有効な色を参照する', () => {
    const pixels = Array.from({ length: 24 }, (_, i) =>
        [i % 4 * 80, Math.floor(i / 4) % 3 * 100, Math.floor(i / 12) * 160, i === 0 ? 0 : 255]);
    const data = Uint8ClampedArray.from(pixels.flat());
    const { matrix, palette, blank } = context.makeColorPuzzle({ width: 6, height: 4, data });
    assert.equal(palette.length, 16);
    assert.equal(matrix.length, 4);
    assert.equal(matrix[0][0], blank);
    assert.ok(matrix[0].slice(1).every(index => index > 0 && index < palette.length));
    assert.ok(matrix.every(row => row.length === 6 &&
        row.every(index => index >= 0 && index < palette.length)));
});

test('圧縮で生じた近い色は同じ色として扱う', () => {
    const { matrix, palette } = context.makeColorPuzzle({
        width: 3,
        height: 1,
        data: Uint8ClampedArray.from([20, 90, 225, 255, 23, 85, 219, 255, 220, 30, 40, 255]),
    });
    assert.equal(palette.length, 3);
    assert.equal(matrix[0][0], matrix[0][1]);
    assert.notEqual(matrix[0][1], matrix[0][2]);
});

test('行順を保ち、明るさの境目と透明度を使って白黒に分ける', () => {
    const image = {
        width: 2,
        height: 2,
        data: Uint8ClampedArray.from([
            0, 0, 0, 255, 0, 0, 0, 0,
            128, 128, 128, 255, 0, 0, 0, 128,
        ]),
    };
    const matrix = threshold =>
        JSON.parse(JSON.stringify(context.makeMonochromeMatrix(image, threshold)));
    assert.deepEqual(matrix(128), [[1, 0], [0, 1]]);
    assert.deepEqual(matrix(127), [[1, 0], [0, 0]]);
    assert.deepEqual(matrix(129), [[1, 0], [1, 1]]);
});
