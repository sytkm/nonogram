const PROGRESS_KEY = 'nonogram:progress:v1';
let progressSource;
let progressId;
let pendingProgress;
let progressFromShare = false;

function readProgress() {
    try {
        return JSON.parse(localStorage.getItem(PROGRESS_KEY));
    } catch {
        return null;
    }
}

function updateResumeButton() {
    document.getElementById('saved-progress').hidden = !readProgress();
}

function setProgressSource(snapshot, id, fromShare = false) {
    flushProgress();
    progressSource = snapshot;
    progressId = id ?? (Date.now() + '-' + Math.random());
    progressFromShare = fromShare;
}

function writeProgress() {
    try {
        const record = { id: progressId, ...progressSource() };
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(record));
        } catch (error) {
            if (error.name !== 'QuotaExceededError') throw error;
            // Prioritize the current board if long undo histories exceed browser storage.
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(record, (key, value) =>
                key === 'past' || key === 'future' ? undefined : value
            ));
        }
        document.getElementById('progress-warning').textContent = '';
        document.getElementById('saved-progress').hidden = false;
        return true;
    } catch {
        document.getElementById('progress-warning').textContent =
            '進み具合を保存できませんでした。遊び続けられますが、ページを閉じると今回の進み具合が失われる場合があります。';
        return false;
    }
}

function queueProgressSave() {
    if (!progressSource || pendingProgress !== undefined) return;
    pendingProgress = window.setTimeout(flushProgress, 250);
}

function flushProgress(force = false) {
    if (pendingProgress !== undefined) {
        window.clearTimeout(pendingProgress);
        pendingProgress = undefined;
        return writeProgress();
    }
    if (progressSource && (force || readProgress()?.id === progressId)) return writeProgress();
    return false;
}

function saveProgressForHome(replace = false) {
    if (!progressFromShare) return 'ready';
    const saved = readProgress();
    if (!replace && pendingProgress === undefined && saved && saved.id !== progressId) return 'conflict';
    return flushProgress(true) ? 'ready' : 'failed';
}

function setupPlayHome() {
    const home = document.getElementById('play-menu-home');
    const dialog = document.getElementById('leave-shared-dialog');
    const message = document.getElementById('leave-shared-message');
    const save = document.getElementById('leave-shared-save');

    function confirmLeave(result) {
        const conflict = result === 'conflict';
        message.textContent = conflict
            ? '別の問題が保存されています。この問題を保存すると、前の保存は上書きされます。'
            : 'この問題を保存できませんでした。続けて遊ぶか、共有リンクを控えてからホームに戻ってください。';
        save.hidden = !conflict;
        dialog.returnValue = '';
        dialog.showModal();
    }

    home.onclick = event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        finishStroke?.();
        const result = saveProgressForHome();
        if (result === 'ready') return;
        event.preventDefault();
        confirmLeave(result);
    };
    dialog.onclose = () => {
        if (dialog.returnValue === 'without-save') {
            window.location.assign(home.href);
        } else if (dialog.returnValue === 'save') {
            const result = saveProgressForHome(true);
            if (result === 'ready') window.location.assign(home.href);
            else confirmLeave(result);
        }
    };
}

function setupProgressRestore() {
    const button = document.getElementById('resume-progress');
    updateResumeButton();
    setupPlayHome();
    window.addEventListener('storage', event => {
        if (!event.key || event.key === PROGRESS_KEY) updateResumeButton();
    });
    window.addEventListener('pagehide', () => {
        finishStroke?.();
        flushProgress();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            finishStroke?.();
            flushProgress();
        }
    });
    button.onclick = async () => {
        const saved = readProgress();
        if (!saved) {
            updateResumeButton();
            return;
        }
        try {
            if (saved.kind === 'mosaic') {
                openMosaic(saved.puzzle, { saved });
            } else {
                await startPuzzle(saved.puzzle, {
                    ...saved.options,
                    board: saved.board,
                    clock: createPlayClock(undefined, saved.clock),
                    progressId: saved.id,
                });
            }
        } catch {
            document.getElementById('progress-warning').textContent = '前回の問題を開けませんでした。元の画像や共有リンクから、もう一度問題を開いてください。';
        }
    };
}
