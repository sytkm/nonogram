const secondsPerPuzzleCell = 10;
const logicHintPenalty = 30;
const conflictCheckPenalty = 60;

function formatPenaltyTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remaining = seconds % 60;
    return (hours ? hours + '時間' : '') + (minutes ? minutes + '分' : '') +
        (remaining || !seconds ? remaining + '秒' : '');
}

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

    return {
        start,
        suspend,
        resume() {
            if (started) start();
        },
        elapsed() {
            return saved + (startedAt === null ? 0 : now() - startedAt);
        },
        snapshot() {
            return { elapsed: this.elapsed(), started, finished };
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
