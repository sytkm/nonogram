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
            prepend(child) { this.firstElementChild = child; },
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
        maxSharedPuzzleCells: 40_000,
        puzzleShareURL: (_, puzzle) => new Promise(resolve => normalShares.push({ puzzle, resolve })),
        mosaicShareURL: (_, puzzle) => new Promise(resolve => splitShares.push({ puzzle, resolve })),
        setupQualityCheck: () => () => {},
    });
    for (const name of ['js/image/image-input.js', 'js/play/mosaic.js', 'js/ui/share-controls.js', 'js/image/image-preview.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    }
    context.setupPuzzleShare = (group, url) => { group.url = url; };
    context.legacyPuzzleShareURL = (_, source) => '?' + source;
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
    context.rasterizePuzzleImage = (_, longestSide) => {
        rasterizations++;
        if (longestSide === 1) return { width: 1, height: 1, data: [230, 20, 40, 255] };
        if (pngColorType !== undefined) {
            return { width: 2, height: 2, data: [230, 20, 40, 255, 12, 45, 235, 255, 0, 0, 0, 0, 255, 255, 255, 255] };
        }
        return { width: 2, height: 1, data: [0, 0, 0, 255, 255, 255, 255, 255] };
    };
    context.leavePuzzleScreen = () => {};
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
    assert.equal(ui.element('puzzle-size-panel').hidden, false);
    assert.equal(ui.element('threshold-panel').hidden, true);
    assert.equal(ui.element('paint-color-count-panel').hidden, true);
    assert.equal(ui.element('puzzle-side-range').hidden, true);
    assert.equal(ui.element('image-status').textContent, '');
    assert.equal(ui.element('puzzle-side').value, '201');
    assert.equal(ui.element('reset-puzzle-side').disabled, true);
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
    assert.equal(ui.element('puzzle-size-panel').hidden, false);
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
    const singleTile = ui.splitShares.at(-1);
    singleTile.resolve('#mosaic=1.single');
    ui.normalShares[0].resolve('#puzzle=1.monochrome');
    await new Promise(setImmediate);
    assert.equal(ui.element('preview-share').url, '#puzzle=1.monochrome');
    assert.equal(ui.element('preview-mosaic-share').url, '#mosaic=1.single');
    assert.equal(ui.element('preview-play-options').firstElementChild, ui.element('play-preview'));
    assert.equal(ui.element('split-preview').disabled, false);
    ui.element('puzzle-mode').value = 'color';
    ui.element('puzzle-mode').change();
    assert.equal(ui.element('preview-share').url, '?original-png');
    assert.equal(ui.element('preview-play-options').firstElementChild, ui.element('split-preview'));
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

test('画像変換の色数・マス数を調整すると、共有とプレイにプレビューの盤面を渡す', async () => {
    const ui = setup({ pngColorType: 6 });
    await ui.element('file').change();
    assert.equal(ui.element('puzzle-side-range').hidden, false);
    assert.equal(ui.element('puzzle-side-range').value, '2');
    assert.equal(ui.element('paint-color-count-panel').hidden, false);
    assert.equal(ui.element('paint-color-limit').value, '7色');
    assert.match(ui.element('paint-color-result').textContent, /使う色：2色/);

    ui.element('paint-color-count').value = '1';
    ui.element('paint-color-count').input();
    assert.equal(ui.rasterizations(), 1);
    assert.match(ui.element('paint-color-result').textContent, /使う色：1色/);
    const puzzle = ui.normalShares.at(-1).puzzle;
    assert.equal(puzzle.palette.length, 2);
    assert.equal(puzzle.matrix[1][0], puzzle.blank);
    ui.element('play-preview').click();
    assert.equal(ui.starts.at(-1).puzzle, puzzle);

    ui.element('puzzle-side-range').value = '1';
    ui.element('puzzle-side-range').input();
    assert.equal(ui.element('puzzle-side').value, '1');
    assert.equal(ui.normalShares.at(-1).puzzle.matrix[0].length, 1);
    ui.element('puzzle-mode').value = 'monochrome';
    ui.element('puzzle-mode').change();
    assert.equal(ui.element('paint-color-count-panel').hidden, true);
    assert.equal(ui.element('threshold-panel').hidden, false);
    ui.element('puzzle-mode').value = 'color';
    ui.element('puzzle-mode').change();
    assert.equal(ui.element('paint-color-limit').value, '1色');
});

test('カラーの縮小は元の色と空白を使い、通常共有には縮小後の盤面を渡す', async () => {
    const ui = setup();
    await ui.element('file').change();
    ui.element('puzzle-side').value = '110';
    ui.element('puzzle-side').input();
    assert.equal(ui.rasterizations(), 0);
    assert.equal(ui.element('preview-canvas').width, 110);
    const resized = ui.normalShares.at(-1).puzzle;
    assert.equal(resized.palette, ui.original.palette);
    assert.equal(resized.blank, ui.original.blank);
    ui.element('play-preview').click();
    assert.equal(ui.starts.at(-1).puzzle, resized);
    assert.equal(ui.starts.at(-1).options.generated, false);
    assert.equal(ui.starts.at(-1).options.shareSource, undefined);

    ui.element('reset-puzzle-side').click();
    assert.equal(ui.element('puzzle-side').value, '201');
    assert.equal(ui.element('preview-share').url, '?original-png');
    ui.element('play-preview').click();
    assert.equal(ui.starts.at(-1).puzzle, ui.original);
});
