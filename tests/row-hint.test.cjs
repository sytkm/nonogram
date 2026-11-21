const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../importfile.js'), 'utf8'), context);
const plain = value => JSON.parse(JSON.stringify(value));

test('未完成の行だけから選び、色や空白が間違っているマスを修正する', () => {
    const blank = 4;
    const answer = [[4, 0, 1], [4, 4, 4], [1, 4, 2], [0, 4, 4]];
    const board = [[-1, 2, 1], [-1, 4, -1], [1, 4, 2], [4, 2, -1]];
    assert.deepEqual(plain(context.pickRowHint(answer, board, blank, () => 0)),
        { row: 0, colors: [-1, 0, 1] });
    assert.deepEqual(plain(context.pickRowHint(answer, board, blank, () => 0.99)),
        { row: 3, colors: [0, 4, -1] });
    assert.deepEqual(board[3], [4, 2, -1]);
});

test('ヒントで埋めた行は次の候補から外れ、全行が完成していれば何もしない', () => {
    const answer = [[0, 1], [1, 0]];
    const board = [[0, -1], [-1, 0]];
    for (const expectedRow of [0, 1]) {
        const { row, colors } = context.pickRowHint(answer, board, 0, () => 0);
        assert.equal(row, expectedRow);
        board[row] = colors;
    }
    assert.equal(context.pickRowHint(answer, board, 0, () => assert.fail('候補のない抽選')), null);
    assert.equal(context.pickRowHint([[0, 0]], [[-1, 0]], 0), null);
});
