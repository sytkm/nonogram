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
        addPenalty(minutes) {
            if (finished) return;
            saved += minutes * 60_000;
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
