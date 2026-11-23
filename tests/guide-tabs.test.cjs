const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup() {
    let focused;
    const tabs = ['basic', 'color', 'controls'].map(id => ({
        attributes: { 'aria-controls': id },
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        focus() { focused = this; },
    }));
    const panels = tabs.map(tab => ({ id: tab.getAttribute('aria-controls') }));
    const content = { scrollTop: 200 };
    const dialog = {
        querySelectorAll: selector => selector === '[role="tab"]' ? tabs : panels,
        querySelector: () => content,
    };
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ui/guide-tabs.js'), 'utf8'), context);
    const reset = context.setupGuideTabs(dialog);
    return { tabs, panels, content, reset, focused: () => focused };
}

function assertSelected(ui, index) {
    assert.deepEqual(ui.tabs.map(tab => tab.attributes['aria-selected']),
        ui.tabs.map((_, i) => String(i === index)));
    assert.deepEqual(ui.tabs.map(tab => tab.tabIndex), ui.tabs.map((_, i) => i === index ? 0 : -1));
    assert.deepEqual(ui.panels.map(panel => panel.hidden), ui.panels.map((_, i) => i !== index));
}

test('タブをクリックすると対象だけを表示し、読み始めの位置に戻す', () => {
    const ui = setup();
    ui.tabs[1].onclick();
    assertSelected(ui, 1);
    assert.equal(ui.content.scrollTop, 0);
    ui.reset();
    assertSelected(ui, 0);
});

test('左右キーは端で循環し、Home・Endでも選択とフォーカスが揃う', () => {
    const ui = setup();
    for (const [from, key, to] of [[0, 'ArrowLeft', 2], [2, 'ArrowRight', 0], [0, 'End', 2], [2, 'Home', 0]]) {
        let prevented = false;
        ui.tabs[from].onkeydown({ key, preventDefault() { prevented = true; } });
        assertSelected(ui, to);
        assert.equal(ui.focused(), ui.tabs[to]);
        assert.equal(prevented, true);
    }
});

test('TabやEscapeは横取りせず、ブラウザの移動と閉じる操作を保つ', () => {
    const ui = setup();
    ui.reset();
    for (const key of ['Tab', 'Escape', 'ArrowDown']) {
        ui.tabs[0].onkeydown({ key, preventDefault() { assert.fail('既定動作を妨げない'); } });
        assertSelected(ui, 0);
    }
});
