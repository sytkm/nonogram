const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '../share-controls.js'), 'utf8');

test('共有URLが従来の形式を保ち、Blueskyの投稿画面に長いURLも渡す', () => {
    const context = vm.createContext({ URL });
    vm.runInContext(script, context);
    const original = 'AA+/=';
    const url = context.legacyPuzzleShareURL('https://example.org/nonogram/?sample#play', original);
    assert.equal(new URL(url).hash, '');
    assert.equal(decodeURIComponent(new URL(url).search.slice(1)), original);
    const compose = new URL(context.blueskyComposeURL(url));
    assert.equal(compose.origin + compose.pathname, 'https://bsky.app/intent/compose');
    assert.equal(compose.searchParams.get('text').split('\n')[1], url);
    const longURL = url + 'a'.repeat(300);
    const longCompose = new URL(context.blueskyComposeURL(longURL));
    assert.equal(longCompose.searchParams.get('text').split('\n')[1], longURL);
});

test('コピーに失敗した場合も、同じ共有リンクを選択して手動でコピーできる', async () => {
    let copied;
    let fail = false;
    let selected = false;
    const context = vm.createContext({
        URL,
        navigator: { clipboard: { writeText: async text => {
            if (fail) throw new Error('denied');
            copied = text;
        } } },
    });
    vm.runInContext(script, context);
    const field = { focus() {}, select() { selected = true; } };
    const controls = Object.fromEntries(['bluesky', 'copy', 'status', 'manual']
        .map(name => ['[data-share-' + name + ']', { removeAttribute() {} }]));
    const manual = controls['[data-share-manual]'];
    manual.querySelector = () => field;
    const group = { querySelector: selector => controls[selector] };
    const link = 'https://example.org/nonogram/?AA%2B%2F%3D';
    context.setupPuzzleShare(group, link);
    const copy = controls['[data-share-copy]'];
    await copy.onclick();
    assert.equal(copied, link);
    assert.equal(manual.hidden, true);
    fail = true;
    await copy.onclick();
    assert.equal(manual.hidden, false);
    assert.equal(field.value, link);
    assert.equal(selected, true);
});
