const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../importfile.js'), 'utf8'), context);

test('拡大やスクロール後も、同じマスを指定できる', () => {
    // 幅6マス、高さ5マス。左に2列、上に2行のヒントがある。
    for (const [rect, x, y] of [
        [{ left: 5, top: 10, width: 60, height: 50 }, 50, 35],
        [{ left: -30, top: -15, width: 180, height: 150 }, 105, 60],
        [{ left: 20, top: 40, width: 30, height: 25 }, 42.5, 52.5],
    ]) {
        const cell = context.boardCellAt(x, y, rect, 60, 50, [20, 20], 10, 4, 3);
        assert.deepEqual({ ...cell }, { row: 0, column: 2 });
    }
});

test('ヒント欄と外側は塗らず、盤面の端のマスは選べる', () => {
    const select = (x, y) => context.boardCellAt(x, y,
        { left: 0, top: 0, width: 120, height: 100 }, 60, 50, [20, 20], 10, 4, 3);

    assert.equal(select(39, 41), null);
    assert.equal(select(41, 39), null);
    assert.equal(select(120, 99), null);
    assert.equal(select(119, 100), null);
    assert.deepEqual({ ...select(40, 40) }, { row: 0, column: 0 });
    assert.deepEqual({ ...select(119, 99) }, { row: 2, column: 3 });
});
