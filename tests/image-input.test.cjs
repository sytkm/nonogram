const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../image-input.js'), 'utf8'), context);

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
