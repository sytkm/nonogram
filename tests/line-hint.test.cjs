const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/puzzle/puzzle-rules.js'), 'utf8'), context);
const plain = value => JSON.parse(JSON.stringify(value));

test('未完成の行と列の両方を候補にし、すでに合っている斜線は変更しない', () => {
    const blank = 4;
    const answer = [[4, 0, 1], [4, 4, 4], [1, 4, 2], [0, 4, 4]];
    const board = [[-1, 2, 1], [-1, 4, -1], [1, 4, 2], [4, 2, -1]];
    assert.deepEqual(plain(context.pickLineHint(answer, board, blank, () => 0)),
        { axis: 'row', index: 0, changes: [{ row: 0, column: 1, color: 0 }] });
    assert.deepEqual(plain(context.pickLineHint(answer, board, blank, () => 0.99)),
        { axis: 'column', index: 1, changes: [{ row: 0, column: 1, color: 0 }, { row: 1, column: 1, color: -1 },
            { row: 2, column: 1, color: -1 }, { row: 3, column: 1, color: -1 }] });
    assert.deepEqual(board[3], [4, 2, -1]);
});

test('列を埋めると交差する行も完成したと判定し、次の候補から外す', () => {
    const answer = [[0, 1], [0, 2], [1, 0]];
    const board = [[-1, 0], [0, 0], [0, -1]];
    const hint = context.pickLineHint(answer, board, 0, () => 0.99);
    assert.equal(hint.axis, 'column');
    assert.equal(hint.index, 1);
    for (const { row, column, color } of hint.changes) board[row][column] = color;
    assert.deepEqual(board, [[-1, 1], [0, 2], [0, -1]]);
    assert.deepEqual(plain(context.pickLineHint(answer, board, 0, () => 0)),
        { axis: 'row', index: 2, changes: [{ row: 2, column: 0, color: 1 }] });
    board[2][0] = 1;
    assert.equal(context.pickLineHint(answer, board, 0, () => assert.fail('候補のない抽選')), null);
});

test('行ヒントで未入力の空白と塗り間違えた空白に斜線を付ける', () => {
    const answer = [[0, 1, 0, 0]];
    const board = [[0, 0, 2, -1]];
    assert.deepEqual(plain(context.pickLineHint(answer, board, 0, () => 0)), {
        axis: 'row',
        index: 0,
        changes: [
            { row: 0, column: 0, color: -1 },
            { row: 0, column: 1, color: 1 },
            { row: 0, column: 2, color: -1 },
        ],
    });
    assert.equal(context.pickLineHint(answer, [[0, 1, 0, -1]], 0), null);
});
