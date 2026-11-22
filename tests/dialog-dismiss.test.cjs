const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup() {
    const listeners = {};
    const closed = [];
    const dialog = {
        open: true,
        addEventListener(type, listener) { listeners[type] = listener; },
        getBoundingClientRect: () => ({ left: 10, right: 110, top: 20, bottom: 120 }),
        close(value) { this.open = false; closed.push(value); listeners.close(); },
    };
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dialog-dismiss.js'), 'utf8'), context);
    context.setupDialogDismiss(dialog);
    const emit = (type, overrides = {}) => {
        const event = { target: dialog, pointerId: 1, isPrimary: true, button: 0,
            clientX: 0, clientY: 0, detail: 1, prevented: false, stopped: false,
            preventDefault() { this.prevented = true; },
            stopPropagation() { this.stopped = true; }, ...overrides };
        listeners[type](event);
        return event;
    };
    return { dialog, closed, emit };
}

test('外側で押して離したクリックだけをキャンセル扱いで閉じ、伝播を止める', () => {
    const ui = setup();
    ui.emit('pointerdown');
    ui.emit('pointerup');
    assert.equal(ui.dialog.open, true); // pointerupでは盤面を露出させない。
    const event = ui.emit('click');
    assert.deepEqual(ui.closed, ['cancel']);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
});

test('内部の余白・子要素・内外をまたぐドラッグでは閉じない', () => {
    for (const [down, up] of [
        [{ clientX: 30, clientY: 40 }, { clientX: 30, clientY: 40 }],
        [{ target: {} }, {}],
        [{ clientX: 30, clientY: 40 }, {}],
        [{}, { clientX: 30, clientY: 40 }],
    ]) {
        const ui = setup();
        ui.emit('pointerdown', down);
        ui.emit('pointerup', up);
        ui.emit('click');
        assert.deepEqual(ui.closed, []);
    }
});

test('別ポインタ・右クリック・キャンセル・キー操作を誤って閉じるクリックにしない', () => {
    for (const scenario of ['pointer', 'right', 'cancel', 'keyboard']) {
        const ui = setup();
        ui.emit('pointerdown', scenario === 'right' ? { button: 2 } : {});
        ui.emit('pointerup', scenario === 'pointer' ? { pointerId: 2 } : {});
        if (scenario === 'cancel') ui.emit('pointercancel');
        ui.emit('click', scenario === 'keyboard' ? { detail: 0 } : {});
        assert.deepEqual(ui.closed, []);
    }
});

test('閉じた状態を再表示しても古いポインタ操作を引き継がない', () => {
    const ui = setup();
    ui.emit('pointerdown');
    ui.emit('pointerup');
    ui.dialog.close('cancel');
    ui.dialog.open = true;
    ui.emit('click');
    assert.deepEqual(ui.closed, ['cancel']);
});
