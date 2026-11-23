// プレイ中のメニュー、遊び方、クリア結果。

function showBoardMenu(selected) {
    for (const button of document.querySelectorAll('.board-menu-button')) {
        const open = button === selected;
        button.setAttribute('aria-expanded', String(open));
        document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    }
}

function setupBoardMenus() {
    const tools = document.getElementById('board-side-controls');
    for (const button of tools.querySelectorAll('.board-menu-button')) {
        button.onclick = () => {
            const open = button.getAttribute('aria-expanded') === 'false';
            showBoardMenu(open ? button : undefined);
        };
    }

    function closeActiveMenu() {
        const trigger = tools.querySelector('.board-menu-button[aria-expanded="true"]');
        if (!trigger) return false;
        showBoardMenu();
        trigger.focus({ preventScroll: true });
        return true;
    }

    tools.addEventListener('click', event => {
        if (event.target.closest('button[data-close-board-menu]')) closeActiveMenu();
    }, { capture: true });
    document.addEventListener('click', event => {
        if (!event.target.closest('.board-menu, .board-menu-button') &&
            tools.querySelector('.board-menu-button[aria-expanded="true"]')) showBoardMenu();
    });
    tools.addEventListener('keydown', event => {
        if (event.key === 'Escape' && closeActiveMenu()) event.preventDefault();
    });
}

function setupPlayGuide() {
    const playGuide = document.getElementById('play-guide-dialog');
    const resetGuideTabs = setupGuideTabs(playGuide);
    const sample = document.getElementById('play-guide-sample');
    const sharedIntro = document.getElementById('play-guide-shared-intro');
    const playPanel = document.getElementById('play-panel');

    function openGuide(returnTarget, onClose) {
        sample.hidden = Boolean(returnTarget);
        sharedIntro.hidden = !returnTarget;
        const visible = boardSetting('showSymbols', playPanel.hidden ? undefined : activeBoard?.state);
        for (const symbol of playGuide.querySelectorAll('[data-guide-symbol]')) {
            symbol.hidden = !visible;
        }
        resetGuideTabs();
        playGuide.showModal();
        if (returnTarget) {
            playGuide.addEventListener('close', () => {
                returnTarget.focus({ preventScroll: true });
                onClose?.();
            }, { once: true });
        }
    }

    for (const button of document.querySelectorAll('[data-open-play-guide]')) {
        button.onclick = () => openGuide();
    }

    return (split, onClose) => {
        if (document.querySelector('dialog[open]')) return false;
        const key = 'nonogram:shared-play-guide:v1';
        // Use tab storage when browser-wide storage is blocked. If neither is
        // available, leave the guide available through the play menu.
        for (const storageName of ['localStorage', 'sessionStorage']) {
            try {
                const storage = window[storageName];
                if (storage.getItem(key)) return false;
                storage.setItem(key, '1');
            } catch {
                continue;
            }
            sharedIntro.textContent = split
                ? '閉じると、受け取った分割問題の全体図に進みます。'
                : '閉じると、受け取った問題で遊べます。';
            openGuide(document.getElementById(split ? 'mosaic-title' : 'canvas'), onClose);
            return true;
        }
        return false;
    };
}


function showClearResult(opener, { title = 'クリア！', note = '', download = false, restart = false, mosaic = false } = {}) {
    const dialog = document.getElementById('clear-result-dialog');
    if (dialog.open) return;
    document.getElementById('clear-result-title').textContent = title;
    const message = document.getElementById('clear-result-note');
    message.textContent = note.trim();
    message.hidden = !message.textContent;
    document.getElementById('downl').hidden = !download;
    document.getElementById('clear-mosaic-downloads').hidden = !mosaic;
    const restartButton = document.getElementById('clear-result-restart');
    restartButton.hidden = !restart;
    restartButton.onclick = restart ? () => document.getElementById('restart-board').click() : null;
    dialog.addEventListener('close', () => {
        if (!dialog.open && opener.getClientRects().length) opener.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal();
}
