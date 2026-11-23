const PROGRESS_KEY = 'nonogram:progress:v1';
const DAILY_PROGRESS_KEY = 'nonogram:daily-progress:v2';
let progressSource;
let progressId;
let pendingProgress;
let progressFromShare = false;
let progressDailyDate;
let resumeProgressId;
const savedTimeFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

function readProgress(key = PROGRESS_KEY) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function readDailyProgress(date) {
    const saved = readProgress(DAILY_PROGRESS_KEY);
    return saved?.board && saved.puzzle && saved.dailyDate === date ? saved : null;
}

function describeSavedProgress(saved) {
    const mosaic = saved.kind === 'mosaic';
    const details = [mosaic ? '分割問題' : '通常問題'];
    const matrix = saved.puzzle?.matrix;
    if (Array.isArray(matrix) && Array.isArray(matrix[0]) && matrix[0].length) {
        details.push(matrix[0].length + '×' + matrix.length + 'マス');
    }
    if (saved.options?.sample) details.push('サンプル');
    else if (saved.options?.shared || saved.fromShare) details.push('共有リンク');

    if (mosaic && Array.isArray(saved.tiles) && saved.tiles.length) {
        const total = saved.tiles.length;
        const complete = saved.tiles.filter(tile => tile?.complete).length;
        details.push(complete + '/' + total + '区画完成');
        if (complete === total) details.push('クリア済み');
    } else if (!mosaic) {
        details.push(saved.board?.finished || saved.clock?.finished ? 'クリア済み' : '未クリア');
    }
    return details.join(' · ');
}

function updateResumeButton(saved = readProgress()) {
    const group = document.getElementById('saved-progress');
    group.hidden = !saved;
    resumeProgressId = saved?.id;
    if (!saved) return;

    document.getElementById('saved-progress-summary').textContent = describeSavedProgress(saved);
    const date = new Date(Number.isFinite(saved.savedAt) ? saved.savedAt : NaN);
    const hasTime = Number.isFinite(date.getTime());
    const time = document.getElementById('saved-progress-time');
    time.dateTime = hasTime ? date.toISOString() : '';
    time.textContent = hasTime ? savedTimeFormat.format(date) : '';
    document.getElementById('saved-progress-timestamp').hidden = !hasTime;
}

function setProgressSource(snapshot, id, fromShare = false, dailyDate) {
    flushProgress();
    progressSource = snapshot;
    progressId = id ?? (Date.now() + '-' + Math.random());
    progressFromShare = fromShare;
    progressDailyDate = dailyDate;
}

function writeProgress() {
    try {
        const record = { id: progressId, ...progressSource(), dailyDate: progressDailyDate, savedAt: Date.now() };
        const key = progressDailyDate ? DAILY_PROGRESS_KEY : PROGRESS_KEY;
        if (progressDailyDate) {
            // 日付をまたいで開いたままの盤面や、別タブの未完成盤面で上書きしない。
            if (progressDailyDate !== dailyDay().key) return false;
            if (readDailyProgress(progressDailyDate)?.board.finished && !record.board.finished) return false;
        }
        try {
            localStorage.setItem(key, JSON.stringify(record));
        } catch (error) {
            if (error.name !== 'QuotaExceededError') throw error;
            // Prioritize the current board if long undo histories exceed browser storage.
            localStorage.setItem(key, JSON.stringify(record, (key, value) =>
                key === 'past' || key === 'future' ? undefined : value
            ));
        }
        document.getElementById('progress-warning').textContent = '';
        if (progressDailyDate) updateDailyPuzzleButton();
        else updateResumeButton(record);
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
    if (!progressSource) return false;
    const saved = progressDailyDate ? readDailyProgress(progressDailyDate) : readProgress();
    if (force || saved?.id === progressId) return writeProgress();
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

    function goHome(event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        finishStroke?.();
        const result = saveProgressForHome();
        if (result === 'ready') return;
        event.preventDefault();
        confirmLeave(result);
    }
    for (const link of document.querySelectorAll('[data-play-home]')) link.onclick = goHome;
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
    window.addEventListener('pageshow', event => {
        if (event.persisted) updateResumeButton();
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
        if (!saved || saved.id !== resumeProgressId) {
            updateResumeButton(saved);
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
