const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup({ decodeFails = false, pngColorType } = {}) {
    const elements = {};
    const painted = [];
    const starts = [];
    const splitShares = [];
    const normalShares = [];
    let rasterizations = 0;
    const ctx = { fillRect() { painted.push(this.fillStyle); } };
    function element(id) {
        return elements[id] ??= {
            hidden: false, disabled: false, value: '', textContent: '', style: {},
            validity: { valid: true }, files: [{}],
            get valueAsNumber() { return Number(this.value); },
            addEventListener(type, handler) { this[type] = handler; },
            focus() {}, getContext: () => ctx,
        };
    }
    const original = {
        matrix: [Array(201).fill(0), Array(201).fill(2)],
        palette: [[200, 20, 30], [10, 40, 220]], blank: 2,
    };
    const context = vm.createContext({
        window: { location: { href: 'https://example.com/nonogram/' } }, document: { getElementById: element },
        setupTabs: () => () => {},
        setupPuzzleShare(group, url) { group.url = url; },
        legacyPuzzleShareURL: (_, source) => '?' + source,
        puzzleShareURL: (_, puzzle) => new Promise(resolve => normalShares.push({ puzzle, resolve })),
        mosaicShareURL: (_, puzzle) => new Promise(resolve => splitShares.push({ puzzle, resolve })),
        setupQualityCheck: () => () => {}, canSplitPuzzle: matrix => matrix[0].length > 10,
    });
    for (const name of ['image-input.js', 'importfile.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    }
    if (pngColorType === undefined) {
        context.readPuzzleImage = async () => ({
            image: { naturalWidth: 201, naturalHeight: 2 }, canPlayLegacyColor: true,
        });
    } else {
        const header = new Uint8Array(29);
        header.set([137, 80, 78, 71, 13, 10, 26, 10]);
        header[25] = pngColorType;
        element('file').files = [{ slice: () => ({ arrayBuffer: async () => header.buffer }) }];
        context.URL = { createObjectURL: () => 'blob:image', revokeObjectURL() {} };
        context.Image = class {
            naturalWidth = 2;
            naturalHeight = 2;
            async decode() {}
        };
    }
    context.readBase64 = async () => 'original-png';
    context.decodeLegacyPng = () => {
        if (decodeFails) throw new Error('unsupported');
        return original;
    };
    context.rasterizePuzzleImage = () => {
        rasterizations++;
        if (pngColorType !== undefined) {
            return { width: 2, height: 2, data: [230, 20, 40, 255, 12, 45, 235, 255, 0, 0, 0, 0, 255, 255, 255, 255] };
        }
        return { width: 2, height: 1, data: [0, 0, 0, 255, 255, 255, 255, 255] };
    };
    context.setPlaying = () => {};
    context.startPuzzle = (puzzle, options) => starts.push({ puzzle, options });
    context.setupImagePicker();
    return { element, original, painted, starts, splitShares, normalShares, rasterizations: () => rasterizations };
}

test('パレットPNGは200マス超でも再変換せずプレビューし、空白を白で描く', async () => {
    const ui = setup();
    await ui.element('file').change();
    assert.equal(ui.starts.length, 0);
    assert.equal(ui.rasterizations(), 0);
    assert.equal(ui.element('image-preview').hidden, false);
    assert.equal(ui.element('puzzle-size-panel').hidden, true);
    assert.equal(ui.element('threshold-panel').hidden, true);
    assert.equal(ui.element('color-note').hidden, true);
    assert.equal(ui.element('image-status').textContent, '');
    assert.equal(ui.element('preview-canvas').width, 201);
    assert.equal(ui.element('preview-canvas').height, 2);
    assert.match(ui.element('preview-size').textContent, /盤面 201 × 2/);
    assert.equal(ui.painted[0], 'rgb(200,20,30)');
    assert.equal(ui.painted.at(-1), '#fff');
});

test('元のPNGの共有操作はプレビューにあり、元のマス・色・空白で遊べる', async () => {
    const ui = setup();
    await ui.element('file').change();
    ui.element('play-preview').click();
    assert.equal(ui.starts[0].puzzle, ui.original);
    assert.equal(ui.element('preview-share').url, '?original-png');
    assert.equal(ui.starts[0].options.generated, false);
});

test('白黒を調整した後、不正なサイズからでも元のカラーへ戻れる', async () => {
    const ui = setup();
    await ui.element('file').change();
    ui.element('puzzle-mode').value = 'monochrome';
    ui.element('puzzle-mode').change();
    assert.equal(ui.rasterizations(), 1);
    assert.equal(ui.element('puzzle-size-panel').hidden, false);
    assert.equal(ui.element('threshold-panel').hidden, false);
    ui.element('puzzle-side').validity.valid = false;
    ui.element('puzzle-side').value = '';
    ui.element('puzzle-side').input();
    assert.equal(ui.element('play-preview').disabled, true);
    ui.element('puzzle-mode').value = 'color';
    ui.element('puzzle-mode').change();
    assert.equal(ui.element('puzzle-size-panel').hidden, true);
    assert.equal(ui.element('play-preview').disabled, false);
    assert.equal(ui.element('preview-quality').disabled, false);
    ui.element('play-preview').click();
    assert.equal(ui.starts[0].puzzle, ui.original);
});

test('カラーPNGの読み込みが失敗した場合は従来の白黒プレビューに戻す', async () => {
    const ui = setup({ decodeFails: true });
    await ui.element('file').change();
    assert.equal(ui.starts.length, 0);
    assert.equal(ui.element('puzzle-size-panel').hidden, false);
    assert.equal(ui.element('threshold-panel').hidden, false);
    assert.equal(ui.element('puzzle-mode-panel').hidden, true);
    assert.match(ui.element('image-status').textContent, /白黒のプレビュー/);
});

test('白黒に切り替えると古い共有リンクを消し、新しい通常リンクを作る', async () => {
    const ui = setup();
    await ui.element('file').change();
    assert.equal(ui.splitShares[0].puzzle, ui.original);
    ui.element('puzzle-mode').value = 'monochrome';
    ui.element('puzzle-mode').change();
    ui.splitShares[0].resolve('#old-split');
    await new Promise(setImmediate);
    assert.equal(ui.element('preview-share').url, null);
    assert.equal(ui.element('preview-mosaic-share').url, null);
    ui.normalShares[0].resolve('#puzzle=1.monochrome');
    await new Promise(setImmediate);
    assert.equal(ui.element('preview-share').url, '#puzzle=1.monochrome');
    ui.element('puzzle-mode').value = 'color';
    ui.element('puzzle-mode').change();
    assert.equal(ui.element('preview-share').url, '?original-png');
});

test('RGB・RGBAのPNGは通常のカラー変換で遊べる', async () => {
    for (const pngColorType of [2, 6]) {
        const ui = setup({ pngColorType });
        await ui.element('file').change();
        assert.equal(ui.element('puzzle-mode-panel').hidden, false);
        assert.equal(ui.element('puzzle-mode').value, 'color');
        ui.normalShares[0].resolve('#puzzle=1.color');
        await new Promise(setImmediate);
        assert.equal(ui.element('preview-share').url, '#puzzle=1.color');
        assert.equal(ui.element('preview-mosaic-share').url, null);
        ui.element('play-preview').click();
        const { matrix, palette, blank } = ui.starts[0].puzzle;
        assert.notEqual(matrix[0][0], matrix[0][1]);
        assert.deepEqual([...palette[matrix[0][0]]], [230, 20, 40]);
        assert.deepEqual([...palette[matrix[0][1]]], [12, 45, 235]);
        assert.equal(matrix[1][0], blank);
    }
});
