const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { gzipSync } = require('node:zlib');
const context = vm.createContext({ URL, Blob, CompressionStream, DecompressionStream, Response, TextDecoder, atob, btoa });
for (const file of ['js/puzzle/mosaic-share.js', 'js/board/board-gestures.js', 'js/puzzle/paint-by-number.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const plain = value => JSON.parse(JSON.stringify(value));
const sample = context.paintSamplePuzzle();

test('塗り絵は正しい未着色マスだけを塗り、空白・別の色・完成マスを変更しない', () => {
    const cells = sample.matrix.map(row => row.map(() => sample.blank));
    const can = (row, column, color) => context.canPaintNumberCell(sample.matrix, cells, sample.blank, { row, column }, color);
    assert.equal(can(2, 3, 1), true);
    assert.equal(can(2, 3, 2), false);
    assert.equal(can(0, 0, 0), false);
    cells[2][3] = 1;
    assert.equal(can(2, 3, 1), false);
    assert.equal(can(-1, 0, 1), false);
});

test('完了色を飛ばして番号順に切り替え、末尾から先頭に戻り、全色完了なら終了する', () => {
    const cells = sample.matrix.map(row => row.map(color => color === 2 || color === 3 ? color : 0));
    const remaining = context.paintColorProgress(sample, cells);
    assert.deepEqual(plain(remaining), [0, 9, 0, 0, 13, 4]);
    assert.equal(context.nextPaintColor(remaining, 1), 4);
    assert.equal(context.nextPaintColor(remaining, 5), 1);
    assert.equal(context.nextPaintColor(context.paintColorProgress(sample, sample.matrix), 5), null);
});

test('パレット順の番号を使い、透過背景と元の色を保持して未使用色を除く', () => {
    const puzzle = { matrix: [[2, 0, 3]], palette: [[9, 8, 7], [0, 0, 0], [4, 5, 6]], blank: 3 };
    assert.deepEqual(plain(context.normalizePaintPuzzle(puzzle)), {
        matrix: [[2, 1, 0]], palette: [[255, 255, 255], [9, 8, 7], [4, 5, 6]], blank: 0,
    });
});

test('最長辺200マス・塗り色15色を許可し、超過・空白のみ・異常データは開始しない', () => {
    const palette = Array.from({ length: 16 }, (_, n) => [n, n, n]);
    const puzzle = { matrix: [Array.from({ length: 200 }, (_, n) => n % 16)], palette, blank: 0 };
    assert.equal(context.paintPuzzleProblem(puzzle), '');
    assert.match(context.paintPuzzleProblem({ ...puzzle, matrix: [Array(201).fill(1)] }), /200/);
    assert.match(context.paintPuzzleProblem({ matrix: [Array.from({ length: 16 }, (_, n) => n)], palette, blank: 16 }), /16色/);
    assert.match(context.paintPuzzleProblem({ ...puzzle, matrix: [[0]] }), /塗るマスがありません/);
    assert.match(context.paintPuzzleProblem({ ...puzzle, matrix: [[1000]] }), /読み直し/);
});

test('塗り絵共有は形式とバージョンを識別し、問題だけを復元して進捗・時間を含めない', async () => {
    const url = new URL(await context.puzzleShareURL('https://example.org/nonogram/?sample', {
        ...sample, board: { finished: true }, clock: { elapsed: 5000 },
    }, '#paint='));
    assert.equal(url.search, '');
    assert.match(url.hash, /^#paint=1\./);
    assert.deepEqual(plain(await context.readPaintShare(url.hash)), plain(sample));
    await assert.rejects(context.readPaintShare(url.hash.replace('#paint=1.', '#paint=2.')));
    await assert.rejects(context.readPaintShare(url.hash.replace('#paint=', '#puzzle=')));
    const oversized = { ...plain(sample), matrix: [Array(201).fill(1)] };
    await assert.rejects(context.readPaintShare('#paint=1.' + gzipSync(JSON.stringify(oversized)).toString('base64url')));
});

test('境界のタッチ補正は直接の対象を優先し、候補が一つだけの場合に補う', () => {
    const target = ({ row, column }) => row === 1 && column === 1;
    assert.deepEqual(plain(context.paintTouchCell({ x: 1.1, y: 1.1 }, 3, 3, 0.2, target)), { row: 1, column: 1 });
    assert.deepEqual(plain(context.paintTouchCell({ x: 0.95, y: 1.5 }, 3, 3, 0.2, target)), { row: 1, column: 1 });
    assert.deepEqual(plain(context.paintTouchCell({ x: 0.95, y: 1.95 }, 3, 3, 0.2, ({ column }) => column === 1)), { row: 1, column: 0 });
});

function storageContext() {
    const storage = new Map();
    const elements = new Map();
    const ctx = vm.createContext({
        document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
        window: { setTimeout: () => 1, clearTimeout() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    });
    for (const file of ['js/puzzle/mosaic-share.js', 'js/puzzle/paint-by-number.js', 'js/play/play-clock.js', 'js/play/progress-store.js', 'js/play/paint-by-number-play.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
    }
    return { ctx, storage, elements };
}
function progressRecord() {
    return { id: 'paint-test', kind: 'paint-by-number', version: 1, puzzle: plain(sample),
        board: { cells: sample.matrix.map(row => row.map(() => 0)) },
        clock: { elapsed: 1200, started: true, finished: false } };
}

test('塗り絵の保存先は通常・日替わりと独立し、時間と色を復元する', () => {
    const { ctx, storage } = storageContext();
    storage.set('nonogram:progress:v1', 'normal-sentinel');
    storage.set('nonogram:daily-progress:v2', 'daily-sentinel');
    const record = progressRecord(); record.board.cells[2][3] = 1; record.board.selectedColor = 4;
    ctx.setProgressSource(() => record, record.id, false, undefined, 'nonogram:paint-by-number:progress:v1');
    ctx.queueProgressSave(); assert.equal(ctx.flushProgress(), true);
    assert.equal(storage.get('nonogram:progress:v1'), 'normal-sentinel');
    assert.equal(storage.get('nonogram:daily-progress:v2'), 'daily-sentinel');
    const saved = ctx.readPaintProgress();
    assert.equal(saved.board.cells[2][3], 1);
    assert.equal(saved.board.selectedColor, 4);
    assert.equal(saved.clock.elapsed, 1200);
    assert.equal(ctx.readProgress(), null);
});

test('保存拒否でも盤面を保持し、保存できないことを伝える', () => {
    const { ctx, elements } = storageContext();
    const record = progressRecord(); record.board.cells[2][3] = 1;
    ctx.localStorage.setItem = () => { throw Object.assign(new Error(), { name: 'SecurityError' }); };
    ctx.setProgressSource(() => record, record.id, false, undefined, 'nonogram:paint-by-number:progress:v1');
    ctx.queueProgressSave(); assert.equal(ctx.flushProgress(), false);
    assert.match(elements.get('progress-warning').textContent, /保存できません/);
    assert.equal(record.board.cells[2][3], 1);
});

test('破損保存・不正な色・不一致の完成状態・未来の保存形式を再開しない', () => {
    const { ctx, storage } = storageContext();
    const key = 'nonogram:paint-by-number:progress:v1';
    storage.set(key, '{broken'); assert.equal(ctx.readPaintProgress(), null);
    for (const mutate of [
        r => { r.version = 2; },
        r => { r.board.cells[0][0] = 2; },
        r => { r.board.cells.pop(); },
        r => { r.board.finished = true; },
        r => { r.clock.finished = true; },
        r => { r.clock.elapsed = -1; },
        r => { r.puzzle.palette[1][0] = 999; },
    ]) {
        const record = progressRecord(); mutate(record); storage.set(key, JSON.stringify(record));
        assert.equal(ctx.readPaintProgress(), null);
    }
});
