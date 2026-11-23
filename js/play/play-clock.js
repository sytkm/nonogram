const secondsPerPuzzleCell = 10;
const logicHintPenalty = 30;
const conflictCheckPenalty = 60;

function penaltyTimeParts(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remaining = seconds % 60;
    const parts = [];
    if (hours) parts.push(hours + '時間');
    if (minutes) parts.push(minutes + '分');
    if (remaining || !seconds) parts.push(remaining + '秒');
    return parts;
}

function formatPenaltyTime(seconds) {
    return penaltyTimeParts(seconds).join('');
}

/**
 * @typedef {object} PlayClockSnapshot
 * @property {number} [elapsed] - 保存時点までのミリ秒
 * @property {boolean} [started] - 計測を一度でも開始したか
 * @property {boolean} [finished] - 完成済みで計測を再開しないか
 */
/**
 * @param {() => number} [now] - 現在時刻をミリ秒で返す関数
 * @param {PlayClockSnapshot} [state] - 以前の保存から復元する場合の値
 */
function createPlayClock(now = () => performance.now(), state = {}) {
    let saved = state.elapsed ?? 0;
    let startedAt = null;
    let started = state.started ?? false;
    let finished = state.finished ?? false;

    function start() {
        if (finished || startedAt !== null) return;
        started = true;
        startedAt = now();
    }

    function suspend() {
        if (startedAt === null) return;
        saved += now() - startedAt;
        startedAt = null;
    }

    function elapsed() {
        return saved + (startedAt === null ? 0 : now() - startedAt);
    }

    return {
        start,
        suspend,
        elapsed,
        snapshot() {
            return { elapsed: elapsed(), started, finished };
        },
        addPenalty(seconds) {
            if (finished) return;
            saved += seconds * 1000;
            start();
        },
        reset() {
            saved = 0;
            startedAt = null;
            started = false;
            finished = false;
        },
        finish() {
            suspend();
            finished = true;
        },
    };
}

function formatPlayTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const pad = value => String(value).padStart(2, '0');
    return (hours ? hours + ':' : '') + pad(minutes % 60) + ':' + pad(seconds % 60);
}
