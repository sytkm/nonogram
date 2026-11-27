const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('新旧の通常共有リンクは最初に盤面全体を表示する', async () => {
    const starts = [];
    const guideCalls = [];
    const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
    const init = [
        'setupPaintProgress', 'setupShareActions', 'setupImagePicker', 'setupProgressRestore', 'setupDailyPuzzle',
        'setupBoardMenus', 'setupSettings', 'setupPaletteNavigation', 'setupPlayDisplay',
    ];
    const puzzle = { matrix: [[1]], palette: [[255, 255, 255], [0, 0, 0]], blank: 0 };
    const context = vm.createContext({
        ...Object.fromEntries(init.map(name => [name, () => {}])),
        window: { location: {}, addEventListener() {} },
        document: { addEventListener() {}, getElementById: () => ({}) },
        normalSharePrefix: '#puzzle=',
        paintSharePrefix: '#paint=',
        mosaicSharePrefix: '#mosaic=',
        setupPlayGuide: () => (split, onClose) => guideCalls.push({ split, onClose }),
        readPuzzleShare: async () => puzzle,
        decodeLegacyPng: () => puzzle,
        startPuzzle: (data, options, guide) => starts.push({ data, options, guide }),
    });
    vm.runInContext(app, context);
    for (const location of [{ search: '', hash: '#puzzle=fixture' }, { search: '?legacy-png', hash: '' }]) {
        context.window.location = location;
        await context.window.onload();
        const { data, options, guide } = starts.at(-1);
        assert.equal(data, puzzle);
        assert.equal(options.shared, true);
        assert.equal(options.fitOnStart, true);
        const onClose = () => {};
        guide(onClose);
        assert.deepEqual(guideCalls.at(-1), { split: false, onClose });
    }
});
