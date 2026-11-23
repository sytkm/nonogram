const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture(storage) {
    const inputs = new Map();
    let refreshed = 0;
    const get = id => {
        if (!inputs.has(id)) inputs.set(id, { hidden: false, showModal() {} });
        return inputs.get(id);
    };
    const open = {};
    const context = vm.createContext({ localStorage: storage,
        document: { getElementById: get, querySelectorAll: () => [open] },
        showBoardMenu() {}, activeBoard: { state: {}, refreshSettings() { refreshed++; } },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-settings.js'), 'utf8'), context);
    context.setupSettings();
    open.onclick();
    return { get, context, refreshed: () => refreshed };
}

test('演出は初期オフで、設定直後と再読み込み後に同じ選択を使う', () => {
    const saved = new Map();
    const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const first = fixture(storage);
    assert.equal(first.get('paint-feedback').checked, false);
    first.get('paint-feedback').checked = true;
    first.get('paint-feedback').onchange();
    assert.equal(first.context.boardSetting('paintFeedback'), true);
    assert.equal(first.refreshed(), 1);
    const next = fixture(storage);
    assert.equal(next.get('paint-feedback').checked, true);
    next.get('paint-feedback').checked = false;
    next.get('paint-feedback').onchange();
    assert.equal(fixture(storage).get('paint-feedback').checked, false);
});

test('保存できない環境でも演出の設定はそのページで切り替えられる', () => {
    const f = fixture({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
    assert.equal(f.get('paint-feedback').checked, false);
    f.get('paint-feedback').checked = true;
    f.get('paint-feedback').onchange();
    assert.equal(f.context.boardSetting('paintFeedback'), true);
});
