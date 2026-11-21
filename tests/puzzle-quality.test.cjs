const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
for (const file of ['line-logic.js', 'puzzle-quality.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const { inspectPuzzleQuality } = context;
const singleRuns = lengths => lengths.map(length => [[length > 0 ? 1 : -1, length]]);

test('6×6の報告例を複数解と判定する', () => {
    const rows = singleRuns([1, 2, 2, 3, 3, 3]);
    const columns = singleRuns([2, 3, 3, 3, 2, 1]);
    assert.equal(inspectPuzzleQuality(rows, columns, 0), 'multiple');
});

test('一意解、矛盾、検査上限を区別する', () => {
    assert.equal(inspectPuzzleQuality(singleRuns([1, 2]), singleRuns([1, 2]), 0), 'unique');
    assert.equal(inspectPuzzleQuality(singleRuns([1, 0]), singleRuns([0, 0]), 0), 'none');
    assert.equal(inspectPuzzleQuality(singleRuns([1, 1]), singleRuns([1, 1]), 0, 1), 'inconclusive');
    assert.equal(inspectPuzzleQuality(singleRuns([0]), singleRuns(Array(201).fill(0)), 0), 'inconclusive');
});

test('カラーの隣接する異色ブロックと、0以外の空白色に対応する', () => {
    const rows = [[[0, 1], [2, 1]], [[2, 1]]];
    const columns = [[[0, 1]], [[2, 2]]];
    assert.equal(inspectPuzzleQuality(rows, columns, 7), 'unique');
});

test('2×3の全配置を列挙して答えの数の分類を照合する', () => {
    function cluesFor(line) {
        const lengths = [];
        let run = 0;
        for (const color of [...line, 0]) {
            if (color) run++;
            else if (run) {
                lengths.push(run);
                run = 0;
            }
        }
        return lengths.length ? lengths.map(length => [1, length]) : [[-1, 0]];
    }
    const counts = new Map();
    for (let bits = 0; bits < 64; bits++) {
        const cells = Array.from({ length: 2 }, (_, row) =>
            Array.from({ length: 3 }, (_, column) => (bits >> (row * 3 + column)) & 1));
        const rows = cells.map(cluesFor);
        const columns = cells[0].map((_, column) => cluesFor(cells.map(row => row[column])));
        const key = JSON.stringify([rows, columns]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
        const [rows, columns] = JSON.parse(key);
        assert.equal(inspectPuzzleQuality(rows, columns, 0), count === 1 ? 'unique' : 'multiple', key);
    }
});

test('6×6の複数解を元画像が空白の一マスだけで一意にする', () => {
    const rows = singleRuns([1, 2, 2, 3, 3, 3]);
    const columns = singleRuns([2, 3, 3, 3, 2, 1]);
    const answer = ['100000', '110000', '011000', '011100', '001110', '000111']
        .map(line => Array.from(line, Number));
    const result = context.preparePuzzleQuality(rows, columns, 0, answer);
    assert.equal(result.quality, 'unique');
    assert.deepEqual(Array.from(result.fixedSlashes), [5]);
    assert.equal(inspectPuzzleQuality(rows, columns, 0, undefined, result.fixedSlashes), 'unique');
    assert.equal(answer[0][5], 0);
});

test('一つに絞るまで初期斜線を追加し、検査上限時は途中の結果を返さない', () => {
    const rows = singleRuns([1, 2, 2, 3, 3, 3]);
    const columns = singleRuns([2, 3, 3, 3, 2, 1]);
    const answer = ['000001', '110000', '110000', '011100', '001110', '001110']
        .map(line => Array.from(line, Number));
    const result = context.preparePuzzleQuality(rows, columns, 0, answer);
    assert.equal(result.quality, 'unique');
    assert.equal(result.fixedSlashes.length, 2);
    assert.ok(result.fixedSlashes.every(index => answer[Math.floor(index / 6)][index % 6] === 0));
    assert.equal(inspectPuzzleQuality(rows, columns, 0, undefined, result.fixedSlashes), 'unique');
    const limited = context.preparePuzzleQuality(rows, columns, 0, answer, 1);
    assert.equal(limited.quality, 'inconclusive');
    assert.equal(limited.fixedSlashes.length, 0);
});
