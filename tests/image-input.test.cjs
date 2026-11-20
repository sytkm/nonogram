const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../image-input.js'), 'utf8'), context);

test('大きな画像を縮め、小さな画像は拡大せず、細い画像も最低1マスにする', () => {
    for (const [width, height, expected] of [
        [600, 300, { width: 30, height: 15 }],
        [1, 200, { width: 1, height: 30 }],
        [8, 12, { width: 8, height: 12 }],
    ]) {
        assert.deepEqual({ ...context.fitPuzzleSize(width, height) }, expected);
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
