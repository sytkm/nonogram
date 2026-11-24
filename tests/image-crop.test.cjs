const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
for (const file of ['image-crop.js', 'image-input.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/image', file), 'utf8'), context);
}

test('縮小表示した縦長画像で、端と範囲外の位置を正しい元画像座標に変換する', () => {
    const bounds = { left: 24, top: 36, width: 120, height: 240 };
    const image = { width: 800, height: 1600 };
    assert.deepEqual({ ...context.imageCropPoint(54, 216, bounds, image) }, { x: 200, y: 1200 });
    assert.deepEqual({ ...context.imageCropPoint(150, 20, bounds, image) }, { x: 800, y: 0 });
});

test('切り抜き画像の縦横比を使って盤面へ変換する', () => {
    const calls = [];
    const drawing = {
        drawImage(...args) { calls.push(args); },
        getImageData(x, y, width, height) { return { width, height }; },
    };
    context.document = { createElement: () => ({ getContext: () => drawing }) };
    const bitmap = { width: 210, height: 420 };
    assert.deepEqual(context.rasterizePuzzleImage(bitmap, 40), { width: 20, height: 40 });
    assert.deepEqual(calls[0], [bitmap, 0, 0, 20, 40]);
});
