const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../importfile.js'), 'utf8'), context);
function fixture() {
    const viewport = { scrollLeft: 100, scrollTop: 200 };
    let cancelled = 0;
    const pan = context.createTouchPan(viewport, () => cancelled++);
    const event = (id, x = 100, y = 100) => ({ pointerId: id, clientX: x, clientY: y });
    return { pan, viewport, event, cancelled: () => cancelled };
}
test('1本指の塗りはスクロールに変えず、2本目で未確定の塗りを取り消す', () => {
    const { pan, viewport, event, cancelled } = fixture();
    assert.equal(pan.down(event(1)), false);
    assert.equal(pan.move(event(1, 120, 130)), false);
    assert.deepEqual(viewport, { scrollLeft: 100, scrollTop: 200 });
    assert.equal(pan.down(event(2, 220, 230)), true);
    assert.equal(cancelled(), 1);
    assert.equal(pan.move(event(1, 100, 110)), true);
    pan.move(event(2, 200, 210));
    assert.deepEqual(viewport, { scrollLeft: 120, scrollTop: 220 });
});
test('2本から1本に戻っても、全部離すまで塗らずクリックも抑止する', () => {
    const { pan, viewport, event } = fixture();
    pan.down(event(1)); pan.down(event(2));
    assert.equal(pan.end(event(2)), true);
    assert.equal(pan.move(event(1, 40, 40)), true);
    assert.deepEqual(viewport, { scrollLeft: 100, scrollTop: 200 });
    assert.equal(pan.end(event(1)), true);
    assert.equal(pan.suppressesClick(), true);
    assert.equal(pan.down(event(3)), false);
    assert.equal(pan.suppressesClick(), false);
    assert.equal(pan.end(event(3)), false);
});
test('指を追加・解除しても位置が飛ばず、逆方向にも移動できる', () => {
    const { pan, viewport, event, cancelled } = fixture();
    pan.down(event(1)); pan.down(event(2, 200, 200));
    pan.down(event(3, 600, 600)); pan.end(event(3));
    assert.deepEqual(viewport, { scrollLeft: 100, scrollTop: 200 });
    pan.move(event(1, 120, 140)); pan.move(event(2, 220, 240));
    assert.deepEqual(viewport, { scrollLeft: 80, scrollTop: 160 });
    assert.equal(cancelled(), 1);
});
test('キャンセル・キャプチャ喪失が重複しても次の入力を妨げない', () => {
    const { pan, event } = fixture();
    pan.down(event(1)); pan.down(event(2));
    assert.equal(pan.end(event(1)), true);
    assert.equal(pan.end(event(1)), false);
    pan.end(event(2));
    assert.equal(pan.down(event(4)), false);
});
test('モード切り替え後は古い指の移動でスクロールしない', () => {
    const { pan, viewport, event } = fixture();
    pan.down(event(1)); pan.down(event(2)); pan.reset();
    assert.equal(pan.move(event(1, 0, 0)), false);
    assert.equal(pan.suppressesClick(), false);
    assert.deepEqual(viewport, { scrollLeft: 100, scrollTop: 200 });
});
