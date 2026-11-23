// ページ起動と、サンプル・共有リンクの入口。

// 5×5の十字を描いたパレット形式のサンプルPNG。
const samplePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAMAAAC6sdbXAAAABlBMVEX///8wW6NnOUAjAAAAFUlEQVR4nGNgYGBkAAEQyQgCDEgiAAClAAqu0sLdAAAAAElFTkSuQmCC';

window.onload = async function () {
    setupImagePicker();
    setupProgressRestore();
    setupDailyPuzzle();
    setupBoardMenus();
    // Safari のネイティブなピンチも、プレイ面で始まった場合だけ抑える。
    for (const type of ['gesturestart', 'gesturechange']) {
        document.addEventListener(type, event => {
            if (!document.querySelector('dialog[open]') &&
                !document.getElementById('play-panel').hidden &&
                event.target.closest?.('header, .play-workspace, #pause-message')) event.preventDefault();
        }, { passive: false });
    }
    setupSettings();
    document.getElementById('open-play-menu').onclick = () => {
        showBoardMenu();
        document.getElementById('play-menu-dialog').showModal();
    };
    const showFirstSharedGuide = setupPlayGuide();
    setupPaletteNavigation();
    setupPlayDisplay();

    const isPuzzleShareHash = hash => hash.startsWith(normalSharePrefix) || hash.startsWith(mosaicSharePrefix);
    // A pasted fragment can navigate within the current page without reloading it.
    window.addEventListener('hashchange', event => {
        if ([event.oldURL, event.newURL].some(url => isPuzzleShareHash(new URL(url).hash))) {
            window.location.reload();
        }
    });

    const { search: query, hash } = window.location;
    if (isPuzzleShareHash(hash)) {
        try {
            const mosaic = hash.startsWith(mosaicSharePrefix);
            if (mosaic) openMosaic(await readMosaicShare(hash), { fromShare: true });
            else await startPuzzle(await readPuzzleShare(hash), { shared: true, generated: true });
            showFirstSharedGuide(mosaic);
        } catch {
            showInvalidSharedPuzzle();
        }
        return;
    }
    if (!query) return;

    try {
        if (query === '?sample') {
            await startPuzzle(decodeLegacyPng(samplePNG), { sample: true, shareSource: samplePNG });
        } else {
            const shareSource = decodeURIComponent(query.slice(1));
            await startPuzzle(decodeLegacyPng(shareSource), { shared: true, shareSource });
            showFirstSharedGuide(false);
        }
    } catch {
        showInvalidSharedPuzzle();
    }
};

function showInvalidSharedPuzzle() {
    document.getElementById('shared-link-status').textContent =
        '共有リンクを開けませんでした。リンクが途中で切れていないか確認してください。';
}
