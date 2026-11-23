const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadDailyPuzzle(overrides = {}) {
    const context = vm.createContext({ window: {}, ...overrides });
    for (const file of ['line-logic.js', 'puzzle-quality.js', 'importfile.js', 'daily-puzzle.js', 'progress-store.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    return context;
}

test('端末の暦で日付を切り替え、8種類の問題を順に出す', () => {
    const { dailyDay, dailyPuzzle } = loadDailyPuzzle();
    const late = dailyDay(new Date(2026, 11, 31, 23, 59));
    const next = dailyDay(new Date(2027, 0, 1, 0, 0));
    assert.equal(late.key, '2026-12-31');
    assert.equal(late.label, '12月31日');
    assert.equal(next.key, '2027-01-01');
    assert.equal(next.label, '1月1日');
    assert.equal(next.index, late.index + 1);
    assert.deepEqual(dailyPuzzle(next), dailyPuzzle(dailyDay(new Date(2027, 0, 1, 23, 59))));
    assert.notDeepEqual(dailyPuzzle(late), dailyPuzzle(next));
    const spring = dailyDay(new Date(2026, 2, 8, 12));
    const springNext = dailyDay(new Date(2026, 2, 9, 12));
    assert.equal(springNext.index - spring.index, 1);
    assert.deepEqual(dailyPuzzle(late), dailyPuzzle({ index: late.index + 8 }));
});

test('日替わりの全問題は別の絵で、行と列の推理だけで一意に解ける', () => {
    const { dailyPuzzle, makeNumber, transpose, inspectPuzzleQuality, inspectLineSolvability } = loadDailyPuzzle();
    const catalog = new Set();
    for (let index = 0; index < 8; index++) {
        const { matrix, blank } = dailyPuzzle({ index });
        assert.equal(matrix.length, 7);
        assert.ok(matrix.every(row => row.length === 7 && row.every(cell => cell === 0 || cell === 1)));
        const [rows] = makeNumber(matrix, blank);
        const [columns] = makeNumber(transpose(matrix), blank);
        assert.equal(inspectPuzzleQuality(rows, columns, blank), 'unique', String(index));
        assert.equal(inspectLineSolvability(rows, columns, blank), 'complete', String(index));
        catalog.add(JSON.stringify(matrix));
    }
    assert.equal(catalog.size, 8);
});

test('日替わりと通常の保存を分け、翌日や未完成のタブによる上書きを防ぐ', () => {
    const storage = new Map();
    const elements = new Map();
    let date = new Date(2026, 10, 23, 23, 59);
    class TestDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [date.valueOf()]));
        }
    }
    const c = loadDailyPuzzle({
        Date: TestDate,
        window: { setTimeout: () => 1, clearTimeout() {} },
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {});
                return elements.get(id);
            },
        },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
    });
    const first = c.dailyDay();
    const state = (day, complete) => () => ({
        kind: 'board', puzzle: c.dailyPuzzle(day), board: { cells: [[1]], finished: complete },
        clock: { elapsed: 1000 },
    });

    c.setProgressSource(state(first, false), 'ordinary');
    c.queueProgressSave();
    c.setProgressSource(state(first, true), 'daily-complete', false, first.key);
    c.queueProgressSave();
    assert.equal(c.flushProgress(), true);
    assert.equal(c.readProgress().id, 'ordinary');
    assert.equal(c.readDailyProgress(first.key).id, 'daily-complete');

    c.setProgressSource(state(first, false), 'old-tab', false, first.key);
    c.queueProgressSave();
    assert.equal(c.flushProgress(), false);
    assert.equal(c.readDailyProgress(first.key).id, 'daily-complete');

    date = new Date(2026, 10, 24, 0, 0);
    const second = c.dailyDay();
    assert.equal(c.readDailyProgress(second.key), null);
    c.setProgressSource(state(second, false), 'next-day', false, second.key);
    c.queueProgressSave();
    c.setProgressSource(state(first, true), 'old-tab', false, first.key);
    c.queueProgressSave();
    assert.equal(c.flushProgress(), false);
    assert.equal(c.readDailyProgress(second.key).id, 'next-day');
    assert.equal(c.readProgress().id, 'ordinary');
});
