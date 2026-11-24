const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/board/board-sound.js'), 'utf8');

function fixture() {
    const played = [];
    const noises = [];
    const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const audio = {
        state: 'running',
        currentTime: 0,
        sampleRate: 48000,
        resume() { this.state = 'running'; return Promise.resolve(); },
        createOscillator: () => ({
            frequency: param, connect() {}, start: time => played.push(time), stop() {},
        }),
        createGain: () => ({ gain: param, connect() {} }),
        createBuffer: (channels, frames) => ({ samples: new Float32Array(frames), getChannelData() { return this.samples; } }),
        createBufferSource: () => ({ connect() {}, start() { noises.push(this.buffer); } }),
    };
    const context = vm.createContext({
        window: { AudioContext: function () { return audio; } },
        performance: { now: () => audio.currentTime * 1000 },
    });
    vm.runInContext(source, context);
    return { audio, played, noises, play: context.playBoardPaintSound };
}

test('音がオンのときだけ再生し、連続入力とタッチ終了で音を重ねない', async () => {
    const { audio, play, played } = fixture();
    await play(() => false);
    await play(() => true);
    audio.currentTime = 0.04;
    await play(() => true);
    audio.currentTime = 0.2;
    await play(() => true, { retryOnTouchEnd: true });
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
    await play(() => true, { retryOnTouchEnd: true });
    assert.deepEqual(played, [0]);
});

test('紙と斜線は別の波形を作り、同じ音には同じ波形を使う', async () => {
    const { audio, play, noises } = fixture();
    await play(() => true, { sound: 'paper' });
    audio.currentTime = 0.2;
    await play(() => true, { sound: 'slash' });
    audio.currentTime = 0.4;
    await play(() => true, { sound: 'paper' });
    assert.ok(noises[0].samples.length < noises[1].samples.length);
    assert.notEqual(noises[0], noises[1]);
    assert.equal(noises[0], noises[2]);
    assert.ok(noises[0].samples.some(sample => sample !== 0));
});
