const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup(maxLength = Infinity) {
    const elements = { 'saved-progress': {}, 'progress-warning': {} };
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
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../progress-store.js'), 'utf8'), context);
    return { context, elements };
}

test('問題を開くだけでは上書きせず、編集後の保存を画面遷移前に確定できる', () => {
    const { context } = setup();
    context.setProgressSource(() => ({ kind: 'board', board: { cells: [[1]] } }), 'first');
    context.queueProgressSave();
    context.setProgressSource(() => ({ kind: 'mosaic', tiles: [{ complete: true }] }), 'second');
    context.flushProgress();
    assert.equal(context.readProgress().id, 'first');
    context.queueProgressSave();
    context.flushProgress();
    assert.equal(context.readProgress().id, 'second');
    assert.equal(context.readProgress().tiles[0].complete, true);
});

test('容量が足りないときも、履歴を省いて現在の盤面と時間を保存する', () => {
    const { context, elements } = setup(180);
    context.setProgressSource(() => ({
        kind: 'board',
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
    context.setProgressSource(() => ({ kind: 'board', board: { cells: [[0]] } }), 'shared', true);
    assert.equal(context.readProgress(), null);
    assert.equal(context.saveProgressForHome(), 'ready');
    assert.equal(context.readProgress().id, 'shared');
});

test('別の保存がある場合は共有問題で自動上書きせず、選んだ場合に限り保存する', () => {
    const { context } = setup();
    context.setProgressSource(() => ({ kind: 'board' }), 'previous');
    context.queueProgressSave();
    context.setProgressSource(() => ({ kind: 'mosaic', tiles: [{ complete: false }] }), 'shared', true);
    assert.equal(context.saveProgressForHome(), 'conflict');
    context.flushProgress();
    assert.equal(context.readProgress().id, 'previous');
    assert.equal(context.saveProgressForHome(true), 'ready');
    assert.equal(context.readProgress().id, 'shared');
    assert.equal(context.readProgress().tiles[0].complete, false);
});

test('共有問題を保存できないときはホームへ移動できる結果を返さない', () => {
    const { context, elements } = setup(0);
    context.setProgressSource(() => ({ kind: 'board' }), 'shared', true);
    assert.equal(context.saveProgressForHome(), 'failed');
    assert.equal(context.readProgress(), null);
    assert.match(elements['progress-warning'].textContent, /保存できません/);
});
