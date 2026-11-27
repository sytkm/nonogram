/**
 * プレイ中の状態。空白は問題の blank、斜線は -1。開いた直後は盤面が未初期化の場合がある。
 * @typedef {object} BoardProgress
 * @property {number[][]} [cells]
 * @property {Record<string, boolean>} [marks] - 行・列のヒントへのチェック
 * @property {boolean} [finished]
 * @property {boolean} [paused]
 */

/**
 * @typedef {object} ProgressSnapshot
 * @property {'board'|'mosaic'|'paint-by-number'} kind
 * @property {PuzzleData} puzzle
 * @property {BoardProgress} [board] - 通常盤面
 * @property {PlayClockSnapshot} [clock]
 * @property {{sample?: boolean, shared?: boolean, generated?: boolean, shareSource?: string}} [options]
 * @property {{complete: boolean, board?: BoardProgress, clock?: PlayClockSnapshot}[]} [tiles] - 分割区画の順序で並ぶ
 * @property {boolean} [fromShare]
 * @property {boolean} [showTimes]
 */

/** @typedef {ProgressSnapshot & {id: string, savedAt?: number, dailyDate?: string}} ProgressRecord */

const PAINT_PROGRESS_KEY = 'nonogram:paint-by-number:progress:v1';
const PROGRESS_KEY = 'nonogram:progress:v1';
const DAILY_PROGRESS_KEY = 'nonogram:daily-progress:v2';
let progressSession;
let pendingProgress;
let resumeProgressId;
const savedTimeFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 過去の保存を読む。保存がない、読み出せない、または再開に必要な構造がない場合は null。
 * @param {string} [key] - 通常または日替わりの保存キー
 * @returns {ProgressRecord|null}
 */
function readProgress(key = PROGRESS_KEY) {
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (!saved || typeof saved.id !== 'string' || !saved.id) return null;
        if (saved.kind !== 'board' && saved.kind !== 'mosaic' &&
            !(key === PAINT_PROGRESS_KEY && saved.kind === 'paint-by-number' && saved.version === 1)) return null;
        if (saved.kind === 'mosaic' && !Array.isArray(saved.tiles)) return null;

        const { matrix, palette, blank } = saved.puzzle ?? {};
        const width = matrix?.[0]?.length;
        if (!Array.isArray(matrix) || !width ||
            !matrix.every(row => Array.isArray(row) && row.length === width)) return null;
        if (!Array.isArray(palette) || !palette.length ||
            !Number.isInteger(blank) || blank < 0 || blank > palette.length) return null;
        return saved;
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

/**
 * 直前の保存を確定し、次に保存する盤面を登録する。盤面のコピーは書き込み時に取得する。
 * @param {() => ProgressSnapshot} snapshot
 * @param {string} [id] - 保存から再開した場合は同じIDを使う
 * @param {boolean} [fromShare] - 保存の入れ替えを確認する共有問題か
 * @param {string} [dailyDate] - 日替わりの保存先を選ぶ日付キー
 * @param {string} [storageKey] - 通常・塗り絵など形式ごとに独立した保存先
 */
function setProgressSource(snapshot, id, fromShare = false, dailyDate, storageKey = PROGRESS_KEY) {
    flushProgress();
    progressSession = { snapshot, id: id ?? (Date.now() + '-' + Math.random()), fromShare, dailyDate, storageKey };
}

function writeProgress() {
    try {
        const { snapshot, id, dailyDate, storageKey } = progressSession;
        const record = { id, ...snapshot(), dailyDate, savedAt: Date.now() };
        const key = dailyDate ? DAILY_PROGRESS_KEY : storageKey;
        if (dailyDate) {
            // 日付をまたいで開いたままの盤面や、別タブの未完成盤面で上書きしない。
            if (dailyDate !== dailyDay().key) return false;
            if (readDailyProgress(dailyDate)?.board.finished && !record.board.finished) return false;
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
        if (dailyDate) updateDailyPuzzleButton();
        else if (storageKey === PAINT_PROGRESS_KEY) updatePaintResumeButton();
        else updateResumeButton(record);
        return true;
    } catch {
        document.getElementById('progress-warning').textContent =
            '進み具合を保存できませんでした。遊び続けられますが、ページを閉じると今回の進み具合が失われる場合があります。';
        return false;
    }
}

function queueProgressSave() {
    if (!progressSession || pendingProgress !== undefined) return;
    pendingProgress = window.setTimeout(flushProgress, 250);
}

function flushProgress(force = false) {
    if (pendingProgress !== undefined) {
        window.clearTimeout(pendingProgress);
        pendingProgress = undefined;
        return writeProgress();
    }
    if (!progressSession) return false;
    const { id, dailyDate, storageKey } = progressSession;
    const saved = dailyDate ? readDailyProgress(dailyDate) : readProgress(storageKey);
    if (force || saved?.id === id) return writeProgress();
    return false;
}

function saveProgressForHome(replace = false) {
    if (!progressSession?.fromShare) return 'ready';
    const saved = readProgress(progressSession.storageKey);
    if (!replace && pendingProgress === undefined && saved && saved.id !== progressSession.id) return 'conflict';
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
    function saveOnExit() {
        finishStroke?.();
        flushProgress();
    }

    window.addEventListener('pagehide', saveOnExit);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) saveOnExit();
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
                const options = { ...saved.options };
                const puzzle = { ...saved.puzzle };
                if (options.sample && !options.shared) {
                    puzzle.palette = decodeLegacyPng(samplePNG).palette;
                    options.shareSource = samplePNG;
                }
                await startPuzzle(puzzle, {
                    ...options,
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
