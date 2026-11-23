const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadDailyPuzzle(overrides = {}) {
    const context = vm.createContext({ window: {}, ...overrides });
    for (const file of ['line-logic.js', 'puzzle-quality.js', 'puzzle-rules.js', 'daily-puzzle.js', 'progress-store.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    return context;
}

test('日本時間の午前0時に日付が変わり、同じ日時は端末の地域によらず同じ盤面になる', () => {
    const { dailyDay, dailyPuzzle } = loadDailyPuzzle();
    const late = dailyDay(new Date('2026-12-31T14:59:59Z'));
    const next = dailyDay(new Date('2026-12-31T15:00:00Z'));
    assert.equal(late.key, '2026-12-31');
    assert.equal(late.label, '12月31日');
    assert.equal(next.key, '2027-01-01');
    assert.equal(next.label, '1月1日');
    assert.equal(next.index, late.index + 1);
    const otherContext = loadDailyPuzzle();
    const sameDay = otherContext.dailyDay(new Date('2027-01-01T06:00:00-08:00'));
    assert.equal(sameDay.key, next.key);
    assert.equal(JSON.stringify(dailyPuzzle(next)), JSON.stringify(otherContext.dailyPuzzle(sameDay)));
    assert.notDeepEqual(dailyPuzzle(late), dailyPuzzle(next));
    assert.notDeepEqual(dailyPuzzle(late), dailyPuzzle({ index: late.index + 8 }));
});

test('366日分の生成結果は行と列の推理だけで一意に解ける', () => {
    const { dailyDay, dailyPuzzle, makeNumber, transpose, inspectPuzzleQuality, inspectLineSolvability } = loadDailyPuzzle();
    const first = dailyDay(new Date('2026-11-23T00:00:00+09:00')).index;
    const catalog = new Set();
    for (let index = first; index < first + 366; index++) {
        const { matrix, blank } = dailyPuzzle({ index });
        assert.equal(matrix.length, 7);
        assert.ok(matrix.every(row => row.length === 7 && row.every(cell => cell === 0 || cell === 1)));
        const [rows] = makeNumber(matrix, blank);
        const [columns] = makeNumber(transpose(matrix), blank);
        assert.equal(inspectPuzzleQuality(rows, columns, blank), 'unique', String(index));
        assert.equal(inspectLineSolvability(rows, columns, blank), 'complete', String(index));
        catalog.add(JSON.stringify(matrix));
    }
    assert.equal(catalog.size, 365);
    assert.equal(dailyPuzzle({ index: first }).matrix.map(row => row.join('')).join('/'),
        '1011110/1000010/1100010/1100010/1111010/1010100/0001000');
});

test('日替わりと通常の保存を分け、翌日や未完成のタブによる上書きを防ぐ', () => {
    const storage = new Map();
    const elements = new Map();
    let date = new Date('2026-11-23T23:59:00+09:00');
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

    date = new Date('2026-11-24T00:00:00+09:00');
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
