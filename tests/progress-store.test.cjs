const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const puzzle = { matrix: [[1, 0]], palette: [[255, 255, 255], [0, 0, 0]], blank: 0 };

function setup(maxLength = Infinity) {
    const elements = Object.fromEntries([
        'saved-progress', 'progress-warning', 'saved-progress-summary', 'saved-progress-time', 'saved-progress-timestamp',
    ].map(id => [id, {}]));
    let stored = null;
    const context = vm.createContext({
        document: { getElementById: id => elements[id] },
        window: { setTimeout: () => 1, clearTimeout: () => {} },
        localStorage: {
            getItem: () => stored,
            setItem(_key, value) {
                if (value.length > maxLength) {
                    throw Object.assign(new Error(), { name: 'QuotaExceededError' });
                }
                stored = value;
            },
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/play/progress-store.js'), 'utf8'), context);
    return { context, elements, setSaved: value => { stored = value; } };
}

test('問題を開くだけでは上書きせず、編集後の保存を画面遷移前に確定できる', () => {
    const { context } = setup();
    context.setProgressSource(() => ({ kind: 'board', puzzle, board: { cells: [[1]] } }), 'first');
    context.queueProgressSave();
    context.setProgressSource(() => ({ kind: 'mosaic', puzzle, tiles: [{ complete: true }] }), 'second');
    context.flushProgress();
    assert.equal(context.readProgress().id, 'first');
    context.queueProgressSave();
    context.flushProgress();
    assert.equal(context.readProgress().id, 'second');
    assert.equal(context.readProgress().tiles[0].complete, true);
});

test('容量が足りないときも、履歴を省いて現在の盤面と時間を保存する', () => {
    const { context, elements } = setup(240);
    context.setProgressSource(() => ({
        kind: 'board', puzzle,
        board: { cells: [[-1, 1]], past: Array(100).fill({ row: 0, column: 1 }) },
        clock: { elapsed: 60_000 },
    }), 'board');
    context.queueProgressSave();
    context.flushProgress();
    const saved = context.readProgress();
    assert.equal(saved.board.cells[0][0], -1);
    assert.equal(saved.board.past, undefined);
    assert.equal(saved.clock.elapsed, 60_000);
    assert.equal(elements['progress-warning'].textContent, '');
});

test('未編集の共有問題はホームに戻る前に保存できる', () => {
    const { context } = setup();
    context.setProgressSource(() => ({ kind: 'board', puzzle, board: { cells: [[0]] } }), 'shared', true);
    assert.equal(context.readProgress(), null);
    assert.equal(context.saveProgressForHome(), 'ready');
    assert.equal(context.readProgress().id, 'shared');
});

test('別の保存がある場合は共有問題で自動上書きせず、選んだ場合に限り保存する', () => {
    const { context } = setup();
    context.setProgressSource(() => ({ kind: 'board', puzzle }), 'previous');
    context.queueProgressSave();
    context.setProgressSource(() => ({ kind: 'mosaic', puzzle, tiles: [{ complete: false }] }), 'shared', true);
    assert.equal(context.saveProgressForHome(), 'conflict');
    context.flushProgress();
    assert.equal(context.readProgress().id, 'previous');
    assert.equal(context.saveProgressForHome(true), 'ready');
    assert.equal(context.readProgress().id, 'shared');
    assert.equal(context.readProgress().tiles[0].complete, false);
});

test('共有問題を保存できないときはホームへ移動できる結果を返さない', () => {
    const { context, elements } = setup(0);
    context.setProgressSource(() => ({ kind: 'board', puzzle }), 'shared', true);
    assert.equal(context.saveProgressForHome(), 'failed');
    assert.equal(context.readProgress(), null);
    assert.match(elements['progress-warning'].textContent, /保存できません/);
});

test('新しい保存は盤面の概要と日時を表示し、日時のない旧保存も再開欄に出す', () => {
    const { context, elements } = setup();
    const describedPuzzle = { ...puzzle, matrix: [[0, 1], [1, 0], [0, 1]] };
    context.updateResumeButton({
        id: 'legacy', kind: 'board', puzzle: describedPuzzle, options: { sample: true }, board: { finished: true },
    });
    assert.equal(elements['saved-progress'].hidden, false);
    assert.match(elements['saved-progress-summary'].textContent, /通常問題.*2×3マス.*サンプル.*クリア済み/);
    assert.equal(elements['saved-progress-timestamp'].hidden, true);

    context.setProgressSource(() => ({
        kind: 'mosaic', puzzle: describedPuzzle, fromShare: true, tiles: [{ complete: true }, {}],
    }), 'shared');
    context.queueProgressSave();
    context.flushProgress();
    const saved = context.readProgress();
    assert.equal(typeof saved.savedAt, 'number');
    assert.match(elements['saved-progress-summary'].textContent, /分割問題.*2×3マス.*共有リンク.*1\/2区画完成/);
    assert.equal(elements['saved-progress-time'].dateTime, new Date(saved.savedAt).toISOString());
    assert.ok(elements['saved-progress-time'].textContent);
    assert.equal(elements['saved-progress-timestamp'].hidden, false);
});

test('再開に必要な項目が欠けた保存はホームに表示しない', () => {
    const { context, elements, setSaved } = setup();
    const saved = { id: 'old', kind: 'board', puzzle };
    const incompleteRecords = [
        'false',
        '[]',
        '{}',
        '{"id":"corrupt",',
        JSON.stringify({ ...saved, id: '' }),
        JSON.stringify({ ...saved, kind: 'unknown' }),
        JSON.stringify({ ...saved, puzzle: { ...puzzle, matrix: [] } }),
        JSON.stringify({ ...saved, puzzle: { ...puzzle, matrix: [[1], null] } }),
        JSON.stringify({ ...saved, puzzle: { ...puzzle, palette: [] } }),
        JSON.stringify({ ...saved, kind: 'mosaic' }),
    ];

    for (const value of incompleteRecords) {
        setSaved(value);
        context.updateResumeButton();
        assert.equal(context.readProgress(), null, value);
        assert.equal(elements['saved-progress'].hidden, true, value);
    }

    setSaved(JSON.stringify(saved));
    context.updateResumeButton();
    assert.equal(context.readProgress().id, 'old');
    assert.equal(elements['saved-progress'].hidden, false);
    assert.equal(elements['saved-progress-timestamp'].hidden, true);
});
