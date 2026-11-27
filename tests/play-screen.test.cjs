const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('盤面の表示だけで時計を進めず、分割一覧へ戻ると止めて保存する', () => {
    const panels = Object.fromEntries([
        'start-panel', 'mosaic-panel', 'play-panel', 'play-actions', 'pixelcanvas', 'board-side-controls',
        'fix-phone-under-menu', 'pause-message', 'open-play-menu', 'play-time', 'site-heading',
    ].map(id => [id, {}]));
    panels['site-heading'].append = () => {};
    let now = 0;
    let clock;
    let strokeFinished = false;
    let minimapClosed = false;
    let saved;
    const context = vm.createContext({
        document: {
            getElementById: id => panels[id],
            querySelector: () => ({ append() {}, setAttribute() {} }),
        },
        flushProgress() {
            assert.equal(strokeFinished, true);
            assert.equal(minimapClosed, true);
            now += 1_000;
            saved = clock.snapshot();
        },
        stopStroke() { strokeFinished = true; },
        closeMinimap() { minimapClosed = true; },
    });
    for (const name of ['play-clock.js', 'puzzle-play.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/play', name), 'utf8'), context);
    }
    vm.runInContext('activeBoard = { stopStroke, closeMinimap }', context);
    clock = context.createPlayClock(() => now);
    context.showPuzzleScreen(clock);
    now = 2_000;
    assert.equal(clock.elapsed(), 0);
    assert.equal(panels['play-panel'].hidden, false);
    assert.equal(panels['mosaic-panel'].hidden, true);

    clock.start();
    now = 5_000;
    context.leavePuzzleScreen('mosaic');
    assert.equal(saved.elapsed, 3_000);
    assert.equal(panels['start-panel'].hidden, true);
    assert.equal(panels['mosaic-panel'].hidden, false);
    assert.equal(panels.pixelcanvas.hidden, true);

    context.showPuzzleScreen(clock);
    clock.start();
    now = 8_000;
    assert.equal(clock.elapsed(), 5_000);
    assert.equal(panels['play-panel'].hidden, false);
});

test('準備と初回案内を除き、盤面が使えるようになった時点から計測する', async () => {
    const elements = new Map();
    function getElementById(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                classList: { add() {}, remove() {} },
                append() {},
                showModal() {},
                close() {},
            });
        }
        return elements.get(id);
    }
    let now = 0;
    let prepared;
    let closeGuide;
    const result = new Promise(resolve => { prepared = resolve; });
    const context = vm.createContext({
        document: { getElementById, querySelector: () => ({ append() {}, setAttribute() {} }) },
        makePuzzleClues: () => ({ rows: [[], 0], columns: [[], 0] }),
        requestPuzzleQuality: () => ({ result }),
        maxPuzzleShareLength: 8_000,
        showBoardMenu() {},
        setPaintPresentation() {},
        drawUnderPalette() {},
        setupBoard: () => ({ stopStroke() {} }),
        setProgressSource() {},
        matchesIntendedImage: () => false,
    });
    for (const name of ['play-clock.js', 'puzzle-play.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/play', name), 'utf8'), context);
    }

    const puzzle = { matrix: [[1]], palette: [[255, 255, 255], [0, 0, 0]], blank: 0 };
    const clock = context.createPlayClock(() => now);
    const opening = context.startPuzzle(puzzle, { clock }, onClose => {
        closeGuide = onClose;
        return true;
    });
    now = 3_000;
    assert.equal(clock.elapsed(), 0);
    prepared({ quality: 'unique' });
    await opening;
    now = 7_000;
    assert.equal(clock.elapsed(), 0);
    closeGuide();
    now = 10_000;
    assert.equal(clock.elapsed(), 3_000);

    const nextClock = context.createPlayClock(() => now);
    await context.startPuzzle(puzzle, { clock: nextClock, board: { quality: 'unique' } });
    now = 12_000;
    assert.equal(nextClock.elapsed(), 2_000);
    assert.equal(clock.elapsed(), 3_000);
});
