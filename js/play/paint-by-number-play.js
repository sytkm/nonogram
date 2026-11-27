// 塗り絵の開始・途中再開・結果。盤面操作と時間の部品はノノグラムと共有する。
function setPaintPresentation(paint) {
    document.body.classList.toggle('is-paint-by-number', paint);
    for (const id of ['palette-blank', 'palette-slash', 'pick-painted-color', 'board-undo', 'board-redo', 'hint-tools-toggle', 'answer-tool', 'restart-board']) {
        document.getElementById(id).hidden = paint;
    }
    document.getElementById('canvas').setAttribute('aria-describedby', paint ? 'paint-keyboard-instructions' : 'keyboard-instructions');
    document.getElementById('canvas').setAttribute('aria-label', paint ? '塗り絵の盤面' : 'ノノグラムの盤面');
}

function readPaintProgress() {
    const saved = readProgress(PAINT_PROGRESS_KEY);
    if (!saved || saved.kind !== 'paint-by-number' || paintPuzzleProblem(saved.puzzle)) return null;
    const { matrix, blank } = saved.puzzle;
    const cells = saved.board?.cells;
    if (!Array.isArray(cells) || cells.length !== matrix.length ||
        !cells.every((row, y) => Array.isArray(row) && row.length === matrix[y].length &&
            row.every((color, x) => color === blank || color === matrix[y][x]))) return null;
    const clock = saved.clock;
    if (!clock || !Number.isFinite(clock.elapsed) || clock.elapsed < 0 ||
        typeof clock.started !== 'boolean' || typeof clock.finished !== 'boolean') return null;
    const complete = paintColorProgress(saved.puzzle, cells).every(count => count === 0);
    if (Boolean(saved.board.finished) !== complete || clock.finished !== complete) return null;
    const normalized = normalizePaintPuzzle(saved.puzzle);
    if (saved.puzzle.blank !== 0 || JSON.stringify(normalized.matrix) !== JSON.stringify(matrix) ||
        JSON.stringify(normalized.palette) !== JSON.stringify(saved.puzzle.palette)) return null;
    return saved;
}

function updatePaintResumeButton() {
    const saved = readPaintProgress();
    document.getElementById('saved-paint-progress').hidden = !saved;
    if (!saved) return;
    document.getElementById('saved-paint-summary').textContent = '塗り絵 · ' + saved.puzzle.matrix[0].length + '×' +
        saved.puzzle.matrix.length + 'マス · ' + (saved.board.finished ? 'クリア済み' : '未クリア') + ' · ' + formatPlayTime(saved.clock.elapsed);
}

function setupPaintProgress() {
    updatePaintResumeButton();
    document.getElementById('resume-paint-progress').onclick = async () => {
        const saved = readPaintProgress();
        if (!saved) return updatePaintResumeButton();
        try { await startPaintPuzzle(saved.puzzle, saved); }
        catch { document.getElementById('shared-link-status').textContent = '塗り絵を再開できませんでした。元の画像や共有リンクから開き直してください。'; }
    };
    window.addEventListener('storage', event => {
        if (!event.key || event.key === PAINT_PROGRESS_KEY) updatePaintResumeButton();
    });
    function suspendPaint() {
        if (activeBoard?.state.kind !== 'paint-by-number') return;
        finishStroke();
        playClock.suspend();
        flushProgress();
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) suspendPaint();
        else if (activeBoard?.state.kind === 'paint-by-number' && !activeBoard.state.paused &&
            !activeBoard.state.finished && !document.getElementById('play-panel').hidden) playClock.resume();
    });
    window.addEventListener('pagehide', suspendPaint);
    window.addEventListener('pageshow', event => {
        updatePaintResumeButton();
        if (event.persisted && !document.hidden && activeBoard?.state.kind === 'paint-by-number' &&
            !activeBoard.state.paused && !activeBoard.state.finished &&
            !document.getElementById('play-panel').hidden) playClock.resume();
    });
}

async function confirmPaintReplacement() {
    const saved = readPaintProgress();
    if (!saved || saved.board.finished) return true;
    const dialog = document.getElementById('paint-replace-dialog');
    document.getElementById('paint-replace-summary').textContent = document.getElementById('saved-paint-summary').textContent;
    dialog.returnValue = '';
    return new Promise(resolve => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), { once: true });
        dialog.showModal();
    });
}

async function openPaintShare(puzzle) {
    const dialog = document.getElementById('paint-share-dialog');
    if (dialog.open) return;
    const group = document.getElementById('paint-share-actions');
    const status = document.getElementById('paint-share-status');
    setupPuzzleShare(group, null);
    status.textContent = '共有リンクを準備しています…';
    dialog.showModal();
    try {
        const url = await puzzleShareURL(window.location.href, puzzle, paintSharePrefix);
        setupPuzzleShare(group, url);
        status.textContent = url ? '' : '共有リンクが8,000文字を超えます。マス数や色数を減らしてお試しください。';
    } catch {
        status.textContent = '共有リンクを作れませんでした。別のブラウザでお試しください。';
    }
}

async function startPaintPuzzle(source, saved) {
    const puzzle = normalizePaintPuzzle(source);
    if (!saved && !await confirmPaintReplacement()) return;
    suspendCurrentPuzzle();
    flushProgress();
    const { matrix, palette, blank } = puzzle;
    const board = saved?.board ?? { cells: matrix.map(row => row.map(() => blank)), marks: {} };
    board.kind = 'paint-by-number';
    board.marks = {};
    const clock = createPlayClock(undefined, saved?.clock);
    const colors = new Set(palette.map((_, color) => color));
    let remaining = paintColorProgress(puzzle, board.cells);
    const initial = remaining[board.selectedColor] > 0 ? board.selectedColor : nextPaintColor(remaining, 0);
    showBoardMenu();
    showPuzzleScreen(clock);
    document.getElementById('play-panel').classList.remove('is-viewing-tile');
    setPaintPresentation(true);
    document.getElementById('daily-play-label').hidden = true;
    document.getElementById('mosaic-tile-label').textContent = '';
    document.querySelector('.play-clock').setAttribute('data-tile-label', '');
    document.getElementById('return-mosaic').hidden = true;
    document.getElementById('board-result').textContent = '';
    document.getElementById('board-result').classList.remove('is-complete');
    const paletteControls = drawUnderPalette(palette, colors, blank, initial ?? 1, { numbered: true });
    const controls = setupBoard({
        answer: matrix, palette, blank, board, clock, paletteControls, paintByNumber: true,
        rowClues: [matrix.map(() => []), 0], columnClues: [matrix[0].map(() => []), 0],
        initialCellSize: 40, multiColor: true, fixedSlashes: new Set(), startWithColor: true,
        onEdit: updateProgress,
    });
    activeBoard = controls;
    setProgressSource(() => ({ kind: 'paint-by-number', version: 1, puzzle, board, clock: clock.snapshot() }),
        saved?.id, false, undefined, PAINT_PROGRESS_KEY);
    const share = () => openPaintShare(puzzle);
    document.getElementById('board-share').onclick = share;
    document.getElementById('clear-paint-share').onclick = share;
    document.getElementById('downl').onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = matrix[0].length;
        canvas.height = matrix.length;
        const context = canvas.getContext('2d');
        matrix.forEach((row, y) => row.forEach((color, x) => {
            if (color === blank) return;
            context.fillStyle = 'rgb(' + palette[color].join(',') + ')';
            context.fillRect(x, y, 1, 1);
        }));
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'paint-by-number.png';
        link.click();
    };
    const clear = document.getElementById('board-clear-result');
    clear.hidden = true;
    clear.onclick = () => showClearResult(clear, { title: '塗り絵クリア！', note: 'プレイ時間 ' + formatPlayTime(clock.elapsed()), download: true });
    function updateProgress(openResult = true) {
        remaining = paintColorProgress(puzzle, board.cells);
        paletteControls.updateRemaining(remaining);
        const current = paletteControls.getSelectedColor();
        const next = remaining[current] ? current : nextPaintColor(remaining, current);
        if (next !== null) {
            const oldButton = document.activeElement;
            const button = paletteControls.selectColor(next);
            board.selectedColor = next;
            if (oldButton?.matches('.palette-color:disabled')) button?.focus({ preventScroll: true });
        } else {
            const wasFinished = board.finished;
            clock.finish();
            controls.finish();
            paletteControls.showSelection(false);
            document.getElementById('board-result').textContent = '塗り絵クリア！';
            clear.hidden = false;
            if (openResult && !wasFinished) clear.click();
        }
        updatePlayTime();
        queueProgressSave();
    }
    paletteControls.updateRemaining(remaining);
    updateProgress(false);
    // 大きい盤面は番号を読める倍率で始め、全体表示は利用者が選べるようにする。
    const viewport = document.getElementById('pixelcanvas');
    if (Math.min(viewport.clientWidth / matrix[0].length, viewport.clientHeight / matrix.length) >= 12) {
        controls.fitInitially();
    }
    if (!board.paused && !board.finished && !document.hidden) clock.resume();
    if (!board.finished && !board.paused) {
        document.querySelector('.palette-color[aria-pressed="true"]')?.focus({ preventScroll: true });
    } else document.getElementById(board.paused ? 'pause-play' : 'board-clear-result').focus({ preventScroll: true });
}
