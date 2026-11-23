const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('標準と全体の倍率を切り替え、ピンチでは指の下の位置を保つ', () => {
    const buttons = Object.fromEntries(['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-standard'].map(id => [id, {}]));
    const context = vm.createContext({
        document: { getElementById: id => buttons[id] },
        window: { matchMedia: () => ({ matches: false }) },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-viewport.js'), 'utf8'), context);

    const viewport = { clientWidth: 200, clientHeight: 150, scrollLeft: 30, scrollTop: 50,
        getBoundingClientRect: () => ({ left: 12, top: 20 }) };
    const canvas = { style: {},
        get clientWidth() { return parseInt(this.style.width) || 0; },
        get clientHeight() { return parseInt(this.style.height) || 0; } };
    const view = context.createBoardViewport({
        viewport, canvas, columns: 19, rows: 19, leftClueCount: 1, topClueCount: 1,
        beforeResize() {}, redraw() {}, afterResize() {},
    });
    view.initialize(40);
    assert.equal(buttons['zoom-fit'].disabled, false);
    assert.equal(buttons['zoom-standard'].disabled, false);
    viewport.scrollLeft = 30;
    viewport.scrollTop = 50;
    buttons['zoom-standard'].onclick();
    assert.equal(view.cellSize, 44);
    assert.equal(buttons['zoom-standard'].disabled, true);
    assert.ok(Math.abs(viewport.scrollLeft - 43) < 1e-9);
    assert.ok(Math.abs(viewport.scrollTop - 62.5) < 1e-9);

    const before = [(viewport.scrollLeft + 50) / view.cellSize, (viewport.scrollTop + 30) / view.cellSize];
    view.pinch.apply(64, { x: 62, y: 50 }, { x: 72, y: 45 });
    assert.equal(view.cellSize, 64);
    assert.equal(buttons['zoom-in'].disabled, true);
    assert.equal(buttons['zoom-standard'].disabled, false);
    assert.ok(Math.abs((viewport.scrollLeft + 60) / view.cellSize - before[0]) < 1e-9);
    assert.ok(Math.abs((viewport.scrollTop + 25) / view.cellSize - before[1]) < 1e-9);
    buttons['zoom-fit'].onclick();
    assert.equal(view.cellSize, 7);
    assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [0, 0]);
    assert.equal(buttons['zoom-fit'].disabled, true);

    viewport.clientWidth = 880;
    viewport.clientHeight = 880;
    view.updateZoomButtons();
    assert.equal(buttons['zoom-fit'].disabled, false);

    buttons['zoom-in'].onclick();
    assert.equal(view.cellSize, 9);
    view.pinch.apply(44, { x: 62, y: 50 }, { x: 62, y: 50 });
    assert.equal(buttons['zoom-fit'].disabled, true);
    assert.equal(buttons['zoom-standard'].disabled, true);

    viewport.clientWidth = 640;
    view.updateZoomButtons();
    assert.equal(buttons['zoom-fit'].disabled, false);
    assert.equal(buttons['zoom-standard'].disabled, true);
});

test('ミニマップの位置を固定ヒントを除いた中央へ合わせ、盤面の端で止める', () => {
    const context = vm.createContext({
        document: { getElementById: () => ({}) },
        window: { matchMedia: () => ({ matches: false }) },
    });
    for (const file of ['board-tools.js', 'board-viewport.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board', file), 'utf8'), context);
    }
    const viewport = {
        clientWidth: 400, clientHeight: 320, scrollWidth: 880, scrollHeight: 880,
        scrollLeft: 0, scrollTop: 0,
    };
    const canvas = { style: {} };
    const view = context.createBoardViewport({
        viewport, canvas, columns: 20, rows: 20, leftClueCount: 2, topClueCount: 2,
        shouldStickClues: () => true, beforeResize() {}, redraw() {}, afterResize() {},
    });
    view.initialize(40);
    view.centerOnCell(10, 10);
    assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [240, 280]);

    view.centerOnCell(19.9, 19.9);
    assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [480, 560]);
    view.centerOnCell(0, 0);
    assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [0, 0]);

    viewport.scrollWidth = viewport.clientWidth;
    viewport.scrollHeight = viewport.clientHeight;
    view.centerOnCell(19.9, 19.9);
    assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [0, 0]);
});
