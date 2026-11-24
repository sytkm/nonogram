const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/board/board-sound.js'), 'utf8');

function fixture() {
    const played = [];
    const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const audio = {
        state: 'running',
        currentTime: 0,
        resume() { this.state = 'running'; return Promise.resolve(); },
        createOscillator: () => ({
            frequency: param, connect() {}, start: time => played.push(time), stop() {},
        }),
        createGain: () => ({ gain: param, connect() {} }),
    };
    const context = vm.createContext({
        window: { AudioContext: function () { return audio; } },
        performance: { now: () => audio.currentTime * 1000 },
    });
    vm.runInContext(source, context);
    return { audio, played, play: context.playBoardPaintSound };
}

test('音がオンのときだけ再生し、連続入力とタッチ終了で音を重ねない', async () => {
    const { audio, play, played } = fixture();
    await play(() => false);
    await play(() => true);
    audio.currentTime = 0.04;
    await play(() => true);
    audio.currentTime = 0.2;
    await play(() => true, true);
    await play(() => true);
    assert.deepEqual(played, [0, 0.2]);
});

test('停止中の音源は入力時に再開し、ブロックされた再生は無視する', async () => {
    const { audio, play, played } = fixture();
    audio.state = 'suspended';
    audio.resume = async () => { throw Error('blocked'); };
    await play(() => true);
    assert.deepEqual(played, []);
    audio.resume = async () => { audio.state = 'running'; };
    await play(() => true, true);
    assert.deepEqual(played, [0]);
});
