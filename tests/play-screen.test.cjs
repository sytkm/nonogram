const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('新しい盤面は入力を待ち、分割一覧へ戻ると時計を止めて保存する', () => {
    const panels = Object.fromEntries([
        'start-panel', 'mosaic-panel', 'play-panel', 'play-actions', 'pixelcanvas', 'board-side-controls',
        'fix-phone-under-menu', 'pause-message', 'open-play-menu', 'play-time', 'site-heading',
    ].map(id => [id, {}]));
    panels['site-heading'].append = () => {};
    let now = 0;
    let clock;
    let strokeFinished = false;
    let saved;
    const context = vm.createContext({
        document: {
            getElementById: id => panels[id],
            querySelector: () => ({ before() {} }),
        },
        flushProgress() {
            assert.equal(strokeFinished, true);
            now += 1_000;
            saved = clock.snapshot();
        },
        stopStroke() { strokeFinished = true; },
    });
    for (const name of ['play-clock.js', 'puzzle-play.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/play', name), 'utf8'), context);
    }
    vm.runInContext('activeBoard = { stopStroke }', context);
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
    now = 8_000;
    assert.equal(clock.elapsed(), 5_000);
    assert.equal(panels['play-panel'].hidden, false);
});
