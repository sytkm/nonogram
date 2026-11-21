function legacyPuzzleShareURL(pageURL, source) {
    const url = new URL(pageURL);
    url.search = encodeURIComponent(source);
    url.hash = '';
    return url.href;
}

function blueskyComposeURL(puzzleURL) {
    const text = 'このNonogramが解けるかな？\n' + puzzleURL;
    const url = new URL('https://bsky.app/intent/compose');
    url.searchParams.set('text', text);
    return url.href;
}

function setupPuzzleShare(group, puzzleURL) {
    const bluesky = group.querySelector('[data-share-bluesky]');
    const copy = group.querySelector('[data-share-copy]');
    const status = group.querySelector('[data-share-status]');
    const manual = group.querySelector('[data-share-manual]');
    const field = manual.querySelector('input');
    const composeURL = puzzleURL && blueskyComposeURL(puzzleURL);

    group.hidden = !puzzleURL;
    bluesky.hidden = !composeURL;
    if (composeURL) bluesky.href = composeURL;
    else bluesky.removeAttribute('href');
    status.textContent = '';
    manual.hidden = true;
    field.value = puzzleURL ?? '';

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(puzzleURL);
            if (copy.onclick !== copyLink) return;
            manual.hidden = true;
            status.textContent = '共有リンクをコピーしました。';
        } catch {
            if (copy.onclick !== copyLink) return;
            manual.hidden = false;
            status.textContent = '自動でコピーできませんでした。表示されたリンクをコピーしてください。';
            field.focus();
            field.select();
        }
    }
    copy.onclick = puzzleURL ? copyLink : null;
}
