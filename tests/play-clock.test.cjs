const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../play-clock.js'), 'utf8'), context);

test('最初の操作で計測し、一時停止と再開を繰り返しても停止時間を数えない', () => {
    let now = 0;
    const clock = context.createPlayClock(() => now);
    clock.suspend();
    clock.resume();
    now = 5000;
    assert.equal(clock.elapsed(), 0);
    clock.start();
    now = 7250;
    clock.start();
    clock.suspend();
    now = 20_000;
    assert.equal(clock.elapsed(), 2250);
    clock.resume();
    now = 21_000;
    clock.suspend();
    assert.equal(clock.elapsed(), 3250);
});

test('答えを見た回数と行数に応じて加算し、クリア後の時刻は変わらない', () => {
    let now = 0;
    const clock = context.createPlayClock(() => now);
    clock.addAnswerPenalty(10);
    now = 2000;
    clock.addAnswerPenalty(10);
    clock.finish();
    now = 80_000;
    clock.resume();
    clock.start();
    clock.addAnswerPenalty(10);
    assert.equal(clock.elapsed(), 1_202_000);
});

test('別の区画を遊んでいる時間は元の区画の時計に加算しない', () => {
    let now = 0;
    const first = context.createPlayClock(() => now);
    const second = context.createPlayClock(() => now);
    first.start();
    now = 3000;
    first.suspend();
    second.start();
    now = 11_000;
    second.finish();
    first.resume();
    now = 13_000;
    first.finish();
    assert.equal(first.elapsed(), 5000);
    assert.equal(second.elapsed(), 8000);
    assert.equal(context.formatPlayTime(first.elapsed() + second.elapsed()), '00:13');
});

test('秒未満を切り捨て、1時間以上の時間も表示する', () => {
    assert.equal(context.formatPlayTime(999), '00:00');
    assert.equal(context.formatPlayTime(60_999), '01:00');
    assert.equal(context.formatPlayTime(3_661_000), '1:01:01');
});
