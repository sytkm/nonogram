const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {}, atob });
for (const file of ['inflate.min.js', 'image-input.js', 'importfile.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const plain = value => JSON.parse(JSON.stringify(value));

test('0番以外にある複数の透明色を空白にし、背景色をヒントに含めない', () => {
    // 4×2。赤と青は不透明、緑と紫は完全に透明。
    const { blank, matrix } = context.decodeLegacyPng(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAMAAABIdo1RAAAADFBMVEXcGR4jUuEA8ADrAPDZFX6QAAAABHRSTlP//wAA0w5UhgAAABJJREFUeJxjYGJgZGZgZmRgAgAARgAN73AMwwAAAABJRU5ErkJggg=='
    );
    assert.notEqual(blank, 0);
    assert.deepEqual(plain(matrix), [[blank, 0, 1, blank], [blank, 1, 0, blank]]);
    assert.deepEqual(plain(context.makeNumber(matrix, blank)), [[[[0, 1], [1, 1]], [[1, 1], [0, 1]]], 2]);
    assert.deepEqual(plain(context.makeNumber(context.transpose(matrix), blank))[0],
        [[[-1, 0]], [[0, 1], [1, 1]], [[1, 1], [0, 1]], [[-1, 0]]]);
});

test('最初の色だけが透明なPNGと、透過情報がないPNGのヒントを維持する', () => {
    const fixtures = [
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAMAAAAsPuSGAAAADFBMVEXcGR4jUuEA8ADrAPDZFX6QAAAAAXRSTlMAQObYZgAAAAxJREFUeJxjYGBkAAAABgACmNWZkgAAAABJRU5ErkJggg==',
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAMAAAAsPuSGAAAADFBMVEXcGR4jUuEA8ADrAPDZFX6QAAAADElEQVR4nGNgYGQAAAAGAAKY1ZmSAAAAAElFTkSuQmCC',
    ];
    for (const fixture of fixtures) {
        const { blank, matrix } = context.decodeLegacyPng(fixture);
        assert.deepEqual(plain(matrix), [[blank, 1, blank]]);
        assert.deepEqual(plain(context.makeNumber(matrix, blank)), [[[[1, 1]]], 1]);
    }
});

test('半透明の色は白に重ねた色で表示し、透明として捨てない', () => {
    const { blank, matrix, palette } = context.decodeLegacyPng(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAMAAADD/I+4AAAADFBMVEXcGR4jUuEA8ADrAPDZFX6QAAAAAXRSTlOArV5bRgAAAAtJREFUeJxjYGAEAAAEAAK/ej9KAAAAAElFTkSuQmCC'
    );
    assert.deepEqual(plain(matrix), [[0, 1]]);
    assert.deepEqual(plain(palette[0]), [237, 140, 142]);
    assert.deepEqual(plain(context.makeNumber(matrix, blank)), [[[[0, 1], [1, 1]]], 2]);
});

test('分割された画像データと異なる行フィルターでも透明なマスの位置を復元する', () => {
    // 4bitで幅3。5行とも同じ画素をフィルター0〜4で別々に符号化したPNG。
    const { blank, matrix } = context.decodeLegacyPng(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFBAMAAAByX0uRAAAADFBMVEXcGR4jUuEA8ADrAPDZFX6QAAAABHRSTlP//wAA0w5UhgAAAAVJREFUeJxjEDK6PJpzAAAAEklEQVRgFJJjYmBg5uRnYWAAAAYSAJWPwAHVAAAAAElFTkSuQmCC'
    );
    assert.deepEqual(plain(matrix), Array.from({ length: 5 }, () => [1, blank, blank]));
});
