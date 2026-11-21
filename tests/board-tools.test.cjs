const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../board-tools.js'), 'utf8'), context);

test('行・列の数字だけをその位置で選べる', () => {
    const rows = [[[1, 3]], [[1, 1], [2, 1]]];
    const columns = [[[1, 1], [2, 1]], [[2, 1]]];
    const locate = (x, y) => context.boardClueAt({ x, y }, rows, columns);
    assert.equal(locate(-0.5, 0.5), 'row:0:0');
    assert.equal(locate(-1.5, 1.5), 'row:1:0');
    assert.equal(locate(-0.5, 1.5), 'row:1:1');
    assert.equal(locate(0.5, -1.5), 'column:0:0');
    assert.equal(locate(1.5, -0.5), 'column:1:0');
    for (const point of [[-1.5, 0.5], [1.5, -1.5], [-0.5, -0.5], [0, 0], [-1, 3]]) {
        assert.equal(locate(...point), null);
    }
});

test('複数マスの操作を一度で取り消し、保存後もやり直せる', () => {
    const state = { cells: [[2, -1]], marks: {} };
    const history = context.createBoardHistory(state);
    history.record([
        { row: 0, column: 0, before: 0, after: 2 },
        { row: 0, column: 1, before: 0, after: -1 },
    ]);
    assert.equal(history.undo(), true);
    assert.deepEqual(state.cells, [[0, 0]]);
    const restored = JSON.parse(JSON.stringify(state));
    const restoredHistory = context.createBoardHistory(restored);
    assert.equal(restoredHistory.redo(), true);
    assert.deepEqual(restored.cells, [[2, -1]]);
});

test('ヒント数字のチェックを取り消せて、新しい操作でやり直し履歴を消す', () => {
    const state = { cells: [[0]], marks: { 'row:0:0': true } };
    const history = context.createBoardHistory(state);
    history.record([{ key: 'row:0:0', before: false, after: true }]);
    history.undo();
    assert.deepEqual(state.marks, {});
    history.record([]);
    assert.equal(history.canRedo(), true);
    history.redo();
    assert.deepEqual(state.marks, { 'row:0:0': true });
    history.undo();
    history.record([{ row: 0, column: 0, before: 0, after: 1 }]);
    assert.equal(history.canRedo(), false);
});

test('空白以外の色に重複しない記号を付ける', () => {
    assert.equal(context.paletteSymbol(1, 0), 'A');
    assert.equal(context.paletteSymbol(0, 4), 'A');
    assert.equal(context.paletteSymbol(27, 0), 'AA');
});

test('スクロールした軸のヒントだけを固定し、盤面が狭い場合は空間を確保する', () => {
    const gutters = (x, y, width, height) => ({
        ...context.fixedClueGutters(x, y, width, height, 120, 100),
    });
    assert.deepEqual(gutters(0, 0, 375, 280), { left: 0, top: 0 });
    assert.deepEqual(gutters(48, 0, 375, 280), { left: 120, top: 0 });
    assert.deepEqual(gutters(48, 60, 375, 280), { left: 120, top: 100 });
    assert.deepEqual(gutters(48, 60, 239, 199), { left: 0, top: 0 });
});

test('固定したヒントと重なる角、外側のマスを区別する', () => {
    const hit = (x, y) => ({ ...context.fixedClueHit(x, y, { top: 100, left: 120 }) });
    assert.deepEqual(hit(119, 99), { left: true, top: true });
    assert.deepEqual(hit(120, 99), { left: false, top: true });
    assert.deepEqual(hit(119, 100), { left: true, top: false });
    assert.deepEqual(hit(120, 100), { left: false, top: false });
    assert.deepEqual(hit(-1, 10), { left: false, top: false });
});
