const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../line-logic.js'), 'utf8'), context);
const { isLinePossible, findBoardConflicts, lineCellChoices, findLogicalHint } = context;

test('未入力のマスと確定した斜線を区別する', () => {
    assert.equal(isLinePossible([0, 1, 0], [[1, 3]], 0), true);
    assert.equal(isLinePossible([-1, 1, 0], [[1, 3]], 0), false);
    assert.equal(isLinePossible([0, -1, 0], [[-1, 0]], 0), true);
    assert.equal(isLinePossible([0, 1, 0], [[-1, 0]], 0), false);
    assert.equal(isLinePossible([9, -1, 1], [[1, 1]], 9), true);
});

test('同色のかたまりは空白で分け、別の色は隣り合ってもよい', () => {
    assert.equal(isLinePossible([1, 1, 0], [[1, 1], [1, 1]], 0), false);
    assert.equal(isLinePossible([1, 0, 1], [[1, 1], [1, 1]], 0), true);
    assert.equal(isLinePossible([1, 2], [[1, 1], [2, 1]], 0), true);
    assert.equal(isLinePossible([2, 1], [[1, 1], [2, 1]], 0), false);
});

test('矛盾した行と列だけを返す', () => {
    const cells = [[1, 0], [0, -1]];
    const { rows, columns } = findBoardConflicts(cells, [[[1, 1]], [[2, 1]]], [[[1, 1]], [[2, 2]]], 0);
    assert.deepEqual([...rows], []);
    assert.deepEqual([...columns], [1]);
});

function lines(colors, length) {
    if (!length) return [[]];
    return lines(colors, length - 1).flatMap(line => colors.map(color => [...line, color]));
}

function cluesFor(line) {
    const clues = [];
    line.forEach((color, index) => {
        if (!color) return;
        if (color === line[index - 1]) clues.at(-1)[1]++;
        else clues.push([color, 1]);
    });
    return clues;
}

test('短いカラー盤面の全候補と比較して、配置可能性が一致する', () => {
    const solutions = new Map();
    for (const line of lines([0, 1, 2], 4)) {
        const key = JSON.stringify(cluesFor(line));
        if (!solutions.has(key)) solutions.set(key, []);
        solutions.get(key).push(line);
    }
    for (const cells of lines([0, -1, 1, 2], 4)) {
        for (const [key, possibleLines] of solutions) {
            const expected = possibleLines.some(line => cells.every((cell, index) =>
                cell === 0 || line[index] === (cell === -1 ? 0 : cell)));
            assert.equal(isLinePossible(cells, JSON.parse(key), 0), expected, cells + ' / ' + key);
        }
    }
});

test('確定する色と空白だけを選び、斜線済みのマスは飛ばす', () => {
    const cells = [[-1, 0, 0]];
    assert.deepEqual({ ...findLogicalHint(cells, [[[2, 2]]], [[[0, 0]], [[2, 1]], [[2, 1]]], 0) },
        { axis: 'row', index: 0, row: 0, column: 1, color: 2 });
    assert.deepEqual({ ...findLogicalHint([[0]], [[[-1, 0]]], [[[-1, 0]]], 0) },
        { axis: 'row', index: 0, row: 0, column: 0, color: 0 });
    assert.equal(findLogicalHint([[0, 0], [0, 0]], [[[1, 1]], [[1, 1]]], [[[1, 1]], [[1, 1]]], 0), null);
    assert.deepEqual(cells, [[-1, 0, 0]]);
});

test('候補の全列挙と比較して、全配置で一致するマスだけを特定する', () => {
    const layouts = lines([0, 1, 2], 4);
    const groups = new Map();
    for (const line of layouts) {
        const key = JSON.stringify(cluesFor(line));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(line);
    }
    for (const cells of lines([0, -1, 1, 2], 4)) {
        for (const [key, candidates] of groups) {
            const matches = candidates.filter(line => cells.every((cell, i) =>
                cell === 0 || line[i] === (cell === -1 ? 0 : cell)));
            const choices = lineCellChoices(cells, JSON.parse(key), 0);
            if (!matches.length) {
                assert.equal(choices, null);
            } else {
                const expected = matches[0].map((color, index) =>
                    matches.every(line => color === line[index]) ? color : null);
                assert.deepEqual(Array.from(choices), expected, cells + ' / ' + key);
            }
        }
    }
});
