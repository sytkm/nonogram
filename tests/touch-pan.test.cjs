const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-gestures.js'), 'utf8'), context);
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

test('なぞり塗りオフでも2本指で移動でき、指を減らしても誤操作しない', () => {
    const { pan, viewport, event } = fixture();
    pan.down(event(1), true); pan.down(event(2, 200, 200), true);
    pan.move(event(1, 80, 60)); pan.move(event(2, 180, 160));
    assert.deepEqual(viewport, { scrollLeft: 120, scrollTop: 240 });
    pan.end(event(2)); pan.move(event(1, 10, 10));
    assert.deepEqual(viewport, { scrollLeft: 120, scrollTop: 240 });
    assert.equal(pan.suppressesClick(), true);
});
test('オフ時は短いタップで塗れるが、1本指のドラッグ後はクリックを抑止する', () => {
    const { pan, viewport, event } = fixture();
    pan.down(event(1), true);
    assert.equal(pan.move(event(1, 102, 102)), false);
    assert.equal(pan.end(event(1)), false);
    assert.equal(pan.suppressesClick(), false);
    assert.deepEqual(viewport, { scrollLeft: 100, scrollTop: 200 });
    pan.down(event(2), true);
    assert.equal(pan.move(event(2, 80, 70)), true);
    assert.deepEqual(viewport, { scrollLeft: 120, scrollTop: 230 });
    pan.move(event(2, 70, 60));
    assert.deepEqual(viewport, { scrollLeft: 130, scrollTop: 240 });
    pan.end(event(2)); assert.equal(pan.suppressesClick(), true);
});
test('オフ時の1本指移動から2本指へ切り替えても位置が飛ばない', () => {
    const { pan, viewport, event } = fixture();
    pan.down(event(1), true); pan.move(event(1, 80, 80));
    pan.down(event(2, 300, 300), true);
    assert.deepEqual(viewport, { scrollLeft: 120, scrollTop: 220 });
    pan.move(event(1, 60, 60)); pan.move(event(2, 280, 280));
    assert.deepEqual(viewport, { scrollLeft: 140, scrollTop: 240 });
    pan.end(event(1)); pan.move(event(2, 200, 200));
    assert.deepEqual(viewport, { scrollLeft: 140, scrollTop: 240 });
});

function pinchFixture() {
    const frames = [];
    const updates = [];
    const pan = context.createTouchPan({}, () => {}, {
        size: () => 40,
        schedule: callback => frames.push(callback),
        apply: (size, from, to) => updates.push({ size, from: { ...from }, to: { ...to } }),
    });
    const event = (pointerId, clientX, clientY = 100) => ({ pointerId, clientX, clientY });
    pan.down(event(1, 100));
    pan.down(event(2, 200));
    return { pan, event, frames, updates };
}

test('同じフレームでの平行移動は指の間隔が一時的に変わっても拡大しない', () => {
    const { pan, event, frames, updates } = pinchFixture();
    pan.move(event(1, 120, 130));
    pan.move(event(2, 220, 130));
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(updates, [{ size: 40, from: { x: 150, y: 100 }, to: { x: 170, y: 130 } }]);
});

test('ピンチは指の間隔から拡大・縮小し、重心の移動も渡す', () => {
    const { pan, event, frames, updates } = pinchFixture();
    pan.move(event(1, 80, 110));
    pan.move(event(2, 230, 110));
    frames.shift()();
    assert.deepEqual(updates[0], { size: 60, from: { x: 150, y: 100 }, to: { x: 155, y: 110 } });
    pan.move(event(1, 125, 110));
    pan.move(event(2, 185, 110));
    pan.end(event(2, 185));
    frames.shift()();
    assert.equal(updates.length, 2);
    assert.equal(updates[1].size, 24);
    assert.equal(pan.move(event(1, 145)), true);
    assert.equal(pan.suppressesClick(), true);
});

test('モード変更で破棄したピンチは次の描画で反映しない', () => {
    const { pan, event, frames, updates } = pinchFixture();
    pan.move(event(1, 50));
    pan.reset();
    frames.shift()();
    assert.deepEqual(updates, []);
});
