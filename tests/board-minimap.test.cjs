const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadMinimap(globals = {}) {
    const context = vm.createContext(globals);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-minimap.js'), 'utf8'), context);
    return context;
}

test('ミニマップの枠は固定ヒントに隠れるマスを含めず、盤面の端で切り詰める', () => {
    const { minimapVisibleRange: range } = loadMinimap();
    assert.deepEqual({ ...range(20, 40, 3, 15, 160, 0) }, { start: 0, end: 1.375 });
    assert.deepEqual({ ...range(20, 40, 2, 235, 200, 80) }, { start: 5.875, end: 8.875 });
    assert.deepEqual({ ...range(20, 20, 2, 360, 120, 40) }, { start: 18, end: 20 });
    assert.equal(range(20, 40, 4, 0, 100, 0), null);
});

test('表示中にだけ入力済みの色を描画し、同じフレームでの変更をまとめる', () => {
    const canvasContext = {
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: image => draws.push(Array.from(image.data)),
    };
    const draws = [];
    const frames = [];
    const elements = {
        'toggle-board-minimap': { setAttribute() {} },
        'board-minimap': { parentElement: {}, setAttribute() {} },
        'board-minimap-canvas': { style: {}, getContext: () => canvasContext },
        'board-minimap-frame': { style: {} },
    };
    const context = loadMinimap({
        document: { getElementById: id => elements[id] },
        requestAnimationFrame: callback => frames.push(callback),
    });
    const cells = [[0, 1, -1]];
    const minimap = context.createBoardMinimap({
        cells, palette: [[0, 0, 0], [15, 32, 48]], blank: 0, leftClueCount: 0, topClueCount: 0,
        viewport: { clientWidth: 100, clientHeight: 30, scrollLeft: 0, scrollTop: 0 },
        boardView: { cellSize: 30, clueGutters: () => ({ left: 0, top: 0 }) },
    });
    minimap.repaint();
    assert.equal(frames.length, 0);
    elements['toggle-board-minimap'].onclick();
    assert.deepEqual(draws[0], [255, 255, 255, 255, 15, 32, 48, 255, 196, 205, 213, 255]);
    cells[0][0] = 1;
    minimap.repaint();
    minimap.repaint();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(draws[1].slice(0, 4), [15, 32, 48, 255]);
    minimap.repaint();
    minimap.close();
    frames.shift()();
    assert.equal(draws.length, 2);
});
