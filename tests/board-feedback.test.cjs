const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
    let now = 0;
    let enabled = true;
    let size = 40;
    const motion = { matches: false };
    const animations = [];
    const marker = { hidden: false, style: {}, animate(frames, options) {
        const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
        animations.push(animation);
        return animation;
    } };
    const context = vm.createContext({ window: { matchMedia: () => motion }, performance: { now: () => now } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/board/board-feedback.js'), 'utf8'), context);
    const feedback = context.createBoardFeedback({ marker, leftClueCount: 2, topClueCount: 3,
        cellSize: () => size, enabled: () => enabled });
    return { feedback, marker, animations, motion,
        time(value) { now = value; }, enable(value) { enabled = value; }, size(value) { size = value; } };
}

test('入力したマスの罫線に短い演出を一つだけ表示し、終了したら消す', () => {
    const f = fixture();
    assert.equal(f.marker.hidden, true);
    f.feedback.show(4, 5);
    assert.deepEqual(f.marker.style, { left: '280px', top: '280px', width: '40px', height: '40px' });
    assert.equal(f.marker.hidden, false);
    assert.equal(f.animations[0].options.duration, 180);
    f.animations[0].onfinish();
    assert.equal(f.marker.hidden, true);
});

test('連続入力を間引き、古い演出の終了で新しい演出を消さない', () => {
    const f = fixture();
    f.feedback.show(0, 0);
    f.time(50); f.feedback.show(0, 1);
    assert.equal(f.animations.length, 1);
    f.time(100); f.feedback.show(0, 2);
    assert.equal(f.animations.length, 2);
    assert.equal(f.animations[0].cancelled, true);
    f.animations[0].onfinish();
    assert.equal(f.marker.hidden, false);
    f.feedback.clear();
    assert.equal(f.marker.hidden, true);
    assert.equal(f.animations[1].cancelled, true);
});

test('設定オフ・動きを減らす設定・小さいマス・未対応ブラウザでは表示しない', () => {
    const f = fixture();
    f.enable(false); f.feedback.show(0, 0);
    f.enable(true); f.motion.matches = true; f.feedback.show(0, 0);
    f.motion.matches = false; f.size(7); f.feedback.show(0, 0);
    f.size(40); f.marker.animate = undefined; f.feedback.show(0, 0);
    assert.equal(f.animations.length, 0);
    assert.equal(f.marker.hidden, true);
});
