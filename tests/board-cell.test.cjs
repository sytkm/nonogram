const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
for (const file of ['js/board/board-renderer.js', 'js/board/board-gestures.js', 'js/puzzle/puzzle-rules.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}

test('拡大やスクロール後も、同じマスを指定できる', () => {
    // 幅6マス、高さ5マス。左に2列、上に2行のヒントがある。
    for (const [rect, x, y] of [
        [{ left: 5, top: 10, width: 60, height: 50 }, 50, 35],
        [{ left: -30, top: -15, width: 180, height: 150 }, 105, 60],
        [{ left: 20, top: 40, width: 30, height: 25 }, 42.5, 52.5],
    ]) {
        const point = context.boardPointAt(x, y, rect, 6, 5, [2, 2]);
        const cell = context.boardCellAt(point, 4, 3);
        assert.deepEqual({ ...cell }, { row: 0, column: 2 });
    }
});

test('ヒント欄と外側は塗らず、盤面の端のマスは選べる', () => {
    const select = (x, y) => context.boardCellAt(context.boardPointAt(x, y,
        { left: 0, top: 0, width: 120, height: 100 }, 6, 5, [2, 2]), 4, 3);

    assert.equal(select(39, 41), null);
    assert.equal(select(41, 39), null);
    assert.equal(select(120, 99), null);
    assert.equal(select(119, 100), null);
    assert.deepEqual({ ...select(40, 40) }, { row: 0, column: 0 });
    assert.deepEqual({ ...select(119, 99) }, { row: 2, column: 3 });
});

test('通常の盤面は表示サイズと画面の画素密度の両方に合わせて描き直す', () => {
    assert.deepEqual({ ...context.boardResolution(264, 264, 2) }, { width: 528, height: 528 });
    assert.deepEqual({ ...context.boardResolution(330, 330, 2) }, { width: 660, height: 660 });
    assert.deepEqual({ ...context.boardResolution(400, 320, 1.25) }, { width: 500, height: 400 });
});

test('大きな盤面でも縦横比を保ち、描画面のメモリ使用量を抑える', () => {
    const { width, height } = context.boardResolution(12800, 6400, 3);
    assert.ok(width <= 4096 && height <= 4096);
    assert.ok(width * height <= 8_388_608);
    assert.ok(Math.abs(width / height - 2) < 0.01);
});

const trace = (from, to, columns = 4, rows = 4) =>
    Array.from(context.traceBoardCells(from, to, columns, rows), cell => [cell.row, cell.column]);

test('移動イベントを飛ばしても、間のマスを進行方向に沿って塗る', () => {
    assert.deepEqual(trace({ x: 0.5, y: 1.5 }, { x: 3.5, y: 1.5 }),
        [[1, 0], [1, 1], [1, 2], [1, 3]]);
    assert.deepEqual(trace({ x: 2.5, y: 3.5 }, { x: 2.5, y: 0.5 }),
        [[3, 2], [2, 2], [1, 2], [0, 2]]);
    assert.deepEqual(trace({ x: 0.5, y: 0.5 }, { x: 3.5, y: 3.5 }),
        [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('斜めの線が途中で通るマスだけを塗り、盤面の外とヒント欄は塗らない', () => {
    assert.deepEqual(trace({ x: 0.5, y: 0.5 }, { x: 3.5, y: 1.5 }),
        [[0, 0], [0, 1], [1, 2], [1, 3]]);
    assert.deepEqual(trace({ x: 3.5, y: 1.5 }, { x: -2, y: 1.5 }),
        [[1, 3], [1, 2], [1, 1], [1, 0]]);
    assert.deepEqual(trace({ x: -1, y: -1 }, { x: 0.5, y: -1 }), []);
});

test('クリア判定は元画像と別の配置でも行・列のヒントが一致すれば受け入れる', () => {
    const original = [[1, 0], [0, 1]];
    const alternate = [[-1, 1], [1, 0]];
    const rowClues = context.makeNumber(original, 0);
    const columnClues = context.makeNumber(context.transpose(original), 0);
    assert.equal(context.checkNumber(rowClues, alternate, 0), true);
    assert.equal(context.checkNumber(columnClues, context.transpose(alternate), 0), true);

    const wrongColumns = [[1, 0], [1, 0]];
    assert.equal(context.checkNumber(rowClues, wrongColumns, 0), true);
    assert.equal(context.checkNumber(columnClues, context.transpose(wrongColumns), 0), false);
});

test('新しく塗ったマスの行・列が完成したら、残りの未入力マスを重複なく選ぶ', () => {
    const cells = [[0, 1, -1], [1, 0, 0], [0, 0, 0]];
    const rows = [[[1, 1]], [[1, 3]], [[1, 1]]];
    const columns = [[[1, 1]], [[1, 3]], [[1, 1]]];
    const changes = [{ row: 0, column: 1, before: 0, after: 1 },
        { row: 1, column: 0, before: 0, after: 1 }];
    const result = context.findCompletedLineBlanks(cells, rows, columns, 0, changes);
    assert.deepEqual(Array.from(result, ({ row, column }) => [row, column]), [[0, 0], [2, 0]]);
    assert.deepEqual(cells, [[0, 1, -1], [1, 0, 0], [0, 0, 0]]);
});

test('色やかたまりが一致しない行・列や、斜線の消去では補助を適用しない', () => {
    const cells = [[9, 1, 1, 9]];
    const columns = [[[2, 1]], [[2, 1]], [[2, 1]], [[2, 1]]];
    const changes = [{ row: 0, column: 1, before: 9, after: 1 }];
    for (const clues of [[[1, 1], [1, 1]], [[2, 2]]]) {
        const result = context.findCompletedLineBlanks(cells, [clues], columns, 9, changes);
        assert.deepEqual(Array.from(result), []);
    }

    const erasure = [{ row: 0, column: 0, before: -1, after: 9 }];
    const result = context.findCompletedLineBlanks(cells, [[[1, 2]]], columns, 9, erasure);
    assert.deepEqual(Array.from(result), []);
});

test('元画像に合わせたクリア判定は別解を除外し、空白と斜線を同じ扱いにする', () => {
    const answer = [[1, 0], [0, 1]];
    assert.equal(context.matchesIntendedImage(answer, [[1, -1], [0, 1]], 0), true);
    assert.equal(context.matchesIntendedImage(answer, [[0, 1], [1, 0]], 0), false);
    assert.equal(context.matchesIntendedImage(answer, [[2, -1], [0, 1]], 0), false);
});
