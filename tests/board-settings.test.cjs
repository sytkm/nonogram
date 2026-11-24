const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture(storage, state = {}) {
    const inputs = new Map();
    let refreshed = 0;
    const get = id => {
        if (!inputs.has(id)) inputs.set(id, { hidden: false, showModal() {} });
        return inputs.get(id);
    };
    const clueActions = [{ value: 'mark' }, { value: 'color' }];
    get('settings-dialog').querySelectorAll = () => clueActions;
    const open = {};
    const context = vm.createContext({ localStorage: storage,
        document: { getElementById: get, querySelectorAll: () => [open] },
        showBoardMenu() {}, activeBoard: { state, refreshSettings() { refreshed++; } },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-settings.js'), 'utf8'), context);
    context.setupSettings();
    open.onclick();
    return { get, context, clueActions, refreshed: () => refreshed };
}

test('演出は初期オンで、明示したオフとオンを再読み込み後も保つ', () => {
    const saved = new Map();
    const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const first = fixture(storage);
    assert.equal(first.get('paint-feedback').checked, true);
    first.get('paint-feedback').checked = false;
    first.get('paint-feedback').onchange();
    assert.equal(first.context.boardSetting('paintFeedback'), false);
    assert.equal(first.refreshed(), 1);
    const next = fixture(storage);
    assert.equal(next.get('paint-feedback').checked, false);
    next.get('paint-feedback').checked = true;
    next.get('paint-feedback').onchange();
    assert.equal(fixture(storage).get('paint-feedback').checked, true);
});

test('保存できない環境でも演出の設定はそのページで切り替えられる', () => {
    const f = fixture({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
    assert.equal(f.get('paint-feedback').checked, true);
    f.get('paint-feedback').checked = false;
    f.get('paint-feedback').onchange();
    assert.equal(f.context.boardSetting('paintFeedback'), false);
});

test('数字を押したときの動作は旧盤面の設定を読み、切り替え後は共通設定を優先する', () => {
    let saved;
    const storage = { getItem: () => saved, setItem: (key, value) => { saved = value; } };
    assert.deepEqual(fixture(storage).clueActions.map(input => input.checked), [true, false]);

    const oldBoard = { pickClueColor: true };
    const first = fixture(storage, oldBoard);
    assert.deepEqual(first.clueActions.map(input => input.checked), [false, true]);
    first.clueActions[0].onchange();
    assert.equal(first.context.boardSetting('pickClueColor', oldBoard), false);

    const next = fixture(storage, oldBoard);
    assert.deepEqual(next.clueActions.map(input => input.checked), [true, false]);
    next.clueActions[1].onchange();
    assert.deepEqual(fixture(storage).clueActions.map(input => input.checked), [false, true]);
});
