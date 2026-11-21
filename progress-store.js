const PROGRESS_KEY = 'nonogram:progress:v1';
let progressSource;
let progressId;
let pendingProgress;

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

function setProgressSource(snapshot, id) {
    flushProgress();
    progressSource = snapshot;
    progressId = id ?? (Date.now() + '-' + Math.random());
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
    } catch {
        document.getElementById('progress-warning').textContent =
            '途中経過を保存できませんでした。このページを開いている間は続けて遊べます。';
    }
}

function queueProgressSave() {
    if (!progressSource || pendingProgress !== undefined) return;
    pendingProgress = window.setTimeout(flushProgress, 250);
}

function flushProgress() {
    if (pendingProgress !== undefined) {
        window.clearTimeout(pendingProgress);
        pendingProgress = undefined;
        writeProgress();
    } else if (progressSource && readProgress()?.id === progressId) {
        writeProgress();
    }
}

function setupProgressRestore() {
    const button = document.getElementById('resume-progress');
    updateResumeButton();
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
                openMosaic(saved.puzzle, saved);
            } else {
                await startPuzzle(saved.puzzle, {
                    ...saved.options,
                    board: saved.board,
                    clock: createPlayClock(undefined, saved.clock),
                    progressId: saved.id,
                });
            }
        } catch {
            document.getElementById('progress-warning').textContent = '前回の問題を開けませんでした。';
        }
    };
}
