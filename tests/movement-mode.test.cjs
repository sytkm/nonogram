const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture(tracePaint = true, startWithColor = false) {
    const elements = new Map();
    function element() {
        return {
            style: {}, attributes: {}, children: [],
            setAttribute(name, value) { this.attributes[name] = value; },
            toggleAttribute() {}, append(...items) { this.children.push(...items); },
            replaceChildren() { this.children = []; }, querySelector() { return element(); },
            setPointerCapture() {}, hasPointerCapture() { return false; },
            releasePointerCapture() {}, contains(item) { return this.children.includes(item); },
            getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; },
            scrollBy() {},
            classList: { toggle() {} },
        };
    }
    function get(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    }
    const settings = { tracePaint };
    const feedbackCalls = [];
    const soundCalls = [];
    const renderer = { paintCell() {}, drawBoard() {}, renderFixedClues() {} };
    const board = { cells: [[0, 0]], marks: {} };
    const context = vm.createContext({
        document: { getElementById: get, createElement: element },
        paletteSymbol: String,
        createBoardRenderer: () => renderer,
        createBoardFeedback: () => ({ clear() {}, show(...cell) { feedbackCalls.push(cell); } }),
        playBoardPaintSound(enabled, retry) { if (enabled() && !retry) soundCalls.push('play'); },
        createBoardViewport: () => ({ initialize() {}, cellSize: 40,
            pointFor: event => ({ x: event.clientX / 40, y: 0.5 }),
            clueGutters: () => ({}), scrollCellIntoView() {} }),
        createBoardMinimap: () => ({ repaint() {}, updateViewport() {} }),
        createBoardHistory: () => ({ record() {}, canUndo: () => false, canRedo: () => false }),
        boardSetting: name => settings[name],
        secondsPerPuzzleCell: 1, logicHintPenalty: 1, conflictCheckPenalty: 1,
        formatPenaltyTime: String, penaltyTimeParts: value => [String(value)],
        queueProgressSave() {}, updatePlayTime() {},
        findCompletedLineBlanks: () => [{ row: 0, column: 1 }],
    });
    for (const name of ['board-gestures', 'board-palette', 'board-controller']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/' + name + '.js'), 'utf8'), context);
    }
    vm.runInContext('updatePaletteNavigation = () => {}', context);
    context.boardClueAt = () => null;
    const paletteControls = context.drawUnderPalette([[255, 255, 255], [0, 0, 0]], new Set([0, 1]), 0, 1);
    const controls = context.setupBoard({ answer: [[1, 1]], palette: [], blank: 0,
        startWithColor, rowClues: [[], 0], columnClues: [[], 0], initialCellSize: 40,
        clock: { addPenalty() {} }, board, fixedSlashes: new Set(), paletteControls, onEdit() {} });
    const canvas = get('canvas');
    const event = (x = 20) => ({ pointerType: 'touch', pointerId: 1, isPrimary: true,
        button: 0, detail: 1, clientX: x, clientY: 20, preventDefault() {} });
    function tap(x = 20) { const e = event(x); canvas.onpointerdown(e); canvas.onpointerup(e); canvas.onclick(e); }
    function hitClue(clue) { context.boardClueAt = () => clue; }
    return { get, canvas, board, controls, paletteControls, settings, event, tap, feedbackCalls, soundCalls, hitClue };
}

test('初期の移動モードではタップ・ドラッグ・キーで塗らず、設定変更でも移動を保つ', () => {
    const f = fixture();
    assert.equal(f.get('palette-move').attributes['aria-pressed'], 'true');
    f.tap();
    f.canvas.onpointerdown(f.event());
    f.canvas.onpointermove(f.event(60));
    f.canvas.onpointerup(f.event(60));
    f.canvas.onfocus();
    for (const key of ['Enter', 'x', 'Delete']) f.canvas.onkeydown({ key, preventDefault() {} });
    f.settings.tracePaint = false;
    f.controls.refreshSettings();
    f.tap();
    assert.deepEqual(f.board.cells, [[0, 0]]);
    assert.equal(f.get('palette-move').attributes['aria-pressed'], 'true');
});

test('色・空白・斜線を選ぶと設定に従って塗れ、移動へ戻せる', () => {
    for (const trace of [true, false]) {
        const f = fixture(trace);
        for (const color of [1, -1, 0]) {
            f.paletteControls.selectColor(color);
            assert.equal(f.get('palette-move').attributes['aria-pressed'], 'false');
            f.tap();
            assert.equal(f.board.cells[0][0], color);
        }
        f.get('palette-move').onclick();
        f.tap(60);
        assert.equal(f.board.cells[0][1], 0);
    }
});

test('スポイト中は色選択を解除し、拾った色で塗りへ戻る', () => {
    const f = fixture();
    f.paletteControls.selectColor(-1); f.tap();
    f.get('pick-painted-color').onclick();
    assert.equal(f.get('palette-slash').attributes['aria-pressed'], 'false');
    f.tap();
    assert.equal(f.get('pick-painted-color').attributes['aria-pressed'], 'false');
    assert.equal(f.get('palette-slash').attributes['aria-pressed'], 'true');
    f.tap(60);
    assert.equal(f.board.cells[0][1], -1);
});

test('なぞり塗り設定は色選択後だけ効き、2本目の指で未確定の塗りを戻す', () => {
    const f = fixture();
    f.paletteControls.selectColor(1);
    f.canvas.onpointerdown(f.event());
    assert.equal(f.board.cells[0][0], 1);
    f.canvas.onpointerdown({ ...f.event(60), pointerId: 2, isPrimary: false });
    assert.deepEqual(f.board.cells, [[0, 0]]);
    f.canvas.onpointerup({ ...f.event(60), pointerId: 2 });
    f.canvas.onpointermove(f.event(60));
    f.canvas.onpointerup(f.event(60));
    f.canvas.onclick(f.event(60));
    assert.deepEqual(f.board.cells, [[0, 0]]);
    f.settings.tracePaint = false;
    f.controls.refreshSettings();
    f.canvas.onpointerdown(f.event());
    assert.equal(f.board.cells[0][0], 0);
    f.canvas.onpointerup(f.event());
    f.canvas.onclick(f.event());
    assert.equal(f.board.cells[0][0], 1);
});


test('演出は手で変えたマスだけに送り、同じ色・移動・自動斜線・答え表示には出さない', () => {
    const f = fixture();
    f.settings.paintSound = true;
    f.tap();
    assert.equal(f.feedbackCalls.length, 0);
    f.settings.autoSlash = true;
    f.paletteControls.selectColor(1);
    f.tap();
    assert.deepEqual(f.feedbackCalls, [[0, 0]]);
    assert.equal(f.board.cells[0][1], -1);
    f.tap();
    assert.equal(f.feedbackCalls.length, 1);
    f.get('solve').onclick();
    assert.equal(f.board.cells[0][1], 1);
    assert.equal(f.feedbackCalls.length, 1);
    assert.deepEqual(f.soundCalls, ['play']);
});

test('色で開始した区画は設定に従って最初のタップで塗れ、移動にも切り替えられる', () => {
    for (const trace of [true, false]) {
        const f = fixture(trace, true);
        assert.equal(f.get('palette-move').attributes['aria-pressed'], 'false');
        assert.equal(f.get('color-palette').children[0].attributes['aria-pressed'], 'true');
        assert.deepEqual(f.board.cells, [[0, 0]]);
        f.tap();
        assert.equal(f.board.cells[0][0], 1);
        f.get('palette-move').onclick();
        f.tap(60);
        assert.equal(f.board.cells[0][1], 0);
    }
});

test('ヒントの数字は音がオンでチェックを新しく付けるときだけ鳴る', () => {
    const f = fixture(false, true);
    const key = 'row:0:0';
    f.hitClue({ key, color: 0 });
    f.settings.paintSound = true;
    f.tap();
    assert.equal(f.board.marks[key], true);
    assert.deepEqual(f.soundCalls, ['play']);
    f.tap();
    assert.equal(f.board.marks[key], undefined);
    f.settings.pickClueColor = true;
    f.tap();
    assert.equal(f.board.marks[key], undefined);
    f.settings.pickClueColor = false;
    f.settings.paintSound = false;
    f.tap();
    assert.equal(f.board.marks[key], true);
    assert.deepEqual(f.soundCalls, ['play']);
});
