function setupShareActions() {
    const template = document.getElementById('share-actions-template');
    for (const placeholder of document.querySelectorAll('[data-share-actions]')) {
        const kind = placeholder.dataset.shareActions;
        const actions = template.content.cloneNode(true);
        actions.querySelector('[data-share-bluesky]').setAttribute('aria-label', 'Blueskyで共有（' + kind + '）');
        actions.querySelector('[data-share-copy]').textContent = kind + 'の共有リンクをコピー';
        placeholder.replaceWith(actions);
    }
}

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
    group.hidden = !puzzleURL;
    if (bluesky) {
        bluesky.hidden = !puzzleURL;
        if (puzzleURL) bluesky.href = blueskyComposeURL(puzzleURL);
        else bluesky.removeAttribute('href');
    }
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

let puzzleShareRequest;

function updatePuzzleSharing(puzzle, shareSource) {
    const previewSharing = document.getElementById('preview-sharing');
    const previewShareUnavailable = document.getElementById('preview-share-unavailable');
    const previewShare = document.getElementById('preview-share');
    const previewShareMessage = document.getElementById('preview-share-message');
    const mosaicShare = document.getElementById('preview-mosaic-share');
    const mosaicShareMessage = document.getElementById('preview-mosaic-share-message');
    const request = {};
    puzzleShareRequest = request;
    setupPuzzleShare(previewShare, null);
    setupPuzzleShare(mosaicShare, null);
    previewShareMessage.textContent = '';
    mosaicShareMessage.textContent = '';
    previewSharing.hidden = !puzzle;
    previewShareUnavailable.hidden = Boolean(puzzle);
    if (!puzzle) return;

    const pageURL = window.location.href;
    if (shareSource) {
        setupPuzzleShare(previewShare, legacyPuzzleShareURL(pageURL, shareSource));
    } else if (puzzle.matrix.length * puzzle.matrix[0].length > maxSharedPuzzleCells) {
        previewShareMessage.textContent = 'この盤面はマス数が多く、共有リンクを作れません。元画像からマス数を減らしてお試しください。';
    } else {
        prepareLink(previewShare, previewShareMessage, '通常問題', puzzleShareURL(pageURL, puzzle));
    }
    if (canSplitPuzzle(puzzle.matrix)) {
        prepareLink(mosaicShare, mosaicShareMessage, '分割問題', mosaicShareURL(pageURL, puzzle));
    }

    async function prepareLink(group, message, label, link) {
        message.textContent = label + 'の共有リンクを準備しています…';
        try {
            const url = await link;
            if (puzzleShareRequest !== request) return;
            setupPuzzleShare(group, url);
            message.textContent = url ? '' : label +
                'の共有リンクが8,000文字を超えます。マス数を減らすか、別の画像を選んでください。';
        } catch {
            if (puzzleShareRequest !== request) return;
            message.textContent = 'このブラウザでは' + label +
                'の共有リンクを作成できませんでした。別のブラウザをお試しください。';
        }
    }
}

function openPlayShare(puzzle, shareSource) {
    const dialog = document.getElementById('play-share-dialog');
    if (dialog.open) return;
    const sharing = document.getElementById('puzzle-sharing');
    dialog.append(sharing);
    updatePuzzleSharing(puzzle, shareSource);
    dialog.onclose = () => {
        if (!dialog.open) document.getElementById('preview-share-panel').append(sharing);
    };
    dialog.showModal();
}
