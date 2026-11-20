const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../importfile.js'), 'utf8'), context);

// PNGのフィルター方式0（フィルターなし）の行データを使用する。
for (const bitDepth of [1, 2, 4, 8]) {
    for (const width of [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17]) {
        test(`${bitDepth}bit・幅${width}: 余白を除き、全行の画素を保持する`, () => {
            const expected = Array.from({ length: 3 }, (_, y) =>
                Array.from({ length: width }, (_, x) => (x + y + 1) % (2 ** bitDepth)));
            const bytesPerRow = Math.ceil(width * bitDepth / 8);
            const data = new Uint8Array((bytesPerRow + 1) * expected.length);
            expected.forEach((row, y) => {
                // 余白に1を詰め、余白を画素として読み込んだ場合も検出する。
                data.fill(255, y * (bytesPerRow + 1) + 1, (y + 1) * (bytesPerRow + 1));
                row.forEach((value, x) => {
                    const offset = y * (bytesPerRow + 1) + 1 + Math.floor(x * bitDepth / 8);
                    const shift = 8 - bitDepth - (x * bitDepth % 8);
                    const mask = (2 ** bitDepth - 1) << shift;
                    data[offset] = (data[offset] & ~mask) | (value << shift);
                });
            });
            const actual = context.makePNGMatrix(data, width, expected.length, bitDepth);
            assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
        });
    }
}
